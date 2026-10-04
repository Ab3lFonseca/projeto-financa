import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { api, type CreateTransactionInput } from "../api/endpoints";
import { ApiError } from "../api/client";
import { queryClient } from "../query";

/**
 * Fila offline (estratégia simples e segura contra conflitos):
 *  - cada lançamento criado sem rede recebe um UUID gerado no aparelho;
 *  - ao reconectar, a fila é enviada em ordem com `Idempotency-Key = id` e o servidor
 *    garante que um reenvio nunca duplica (409 ALREADY_PROCESSED conta como sucesso);
 *  - rejeição definitiva do servidor (4xx) fica marcada como "falhou" para o usuário decidir.
 */
export type OutboxItem = {
  id: string;
  kind: "transaction" | "transfer";
  body: Record<string, unknown>;
  createdAt: number;
  error?: string;
};

type OutboxState = {
  items: OutboxItem[];
  enqueue: (item: Omit<OutboxItem, "createdAt">) => void;
  remove: (id: string) => void;
  fail: (id: string, error: string) => void;
  retry: (id: string) => void;
  clear: () => void;
};

export const useOutbox = create<OutboxState>()(
  persist(
    (set) => ({
      items: [],
      enqueue: (item) => set((s) => (s.items.some((i) => i.id === item.id) ? s : { items: [...s.items, { ...item, createdAt: Date.now() }] })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      fail: (id, error) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, error } : i)) })),
      retry: (id) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, error: undefined } : i)) })),
      clear: () => set({ items: [] }),
    }),
    { name: "outbox-v1", storage: createJSONStorage(() => AsyncStorage) },
  ),
);

let flushing = false;

/** Envia a fila em ordem. Retorna quantos itens foram sincronizados. */
export async function flushOutbox(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let synced = 0;
  try {
    const { items, remove, fail } = useOutbox.getState();
    for (const item of items) {
      if (item.error) continue;
      try {
        if (item.kind === "transaction") await api.transactions.create(item.body as CreateTransactionInput, item.id);
        else await api.transfers.create(item.body as never, item.id);
        remove(item.id);
        synced++;
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.code === "ALREADY_PROCESSED") {
            remove(item.id); // já chegou antes (resposta perdida): sucesso
            synced++;
            continue;
          }
          if (err.status === 0 || err.status >= 500 || err.status === 401) break; // tenta de novo depois
          fail(item.id, err.message); // 4xx: o servidor recusou de vez
          continue;
        }
        break;
      }
    }
  } finally {
    flushing = false;
  }
  if (synced > 0) await queryClient.invalidateQueries();
  return synced;
}

import { beforeEach, describe, expect, it, vi } from "vitest";

// Módulos nativos/de rede simulados: o que se testa aqui é a regra da fila, não a infraestrutura.
const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
  },
}));
vi.mock("../api/client", () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
    get isNetwork() {
      return this.status === 0;
    }
  },
}));
vi.mock("../api/endpoints", () => ({
  api: { transactions: { create: vi.fn() }, transfers: { create: vi.fn() } },
}));
vi.mock("../query", () => ({ queryClient: { invalidateQueries: vi.fn(async () => undefined) } }));

import { api } from "../api/endpoints";
import { ApiError } from "../api/client";
import { queryClient } from "../query";
import { flushOutbox, useOutbox } from "./outbox";

const createTx = vi.mocked(api.transactions.create);
const createTransfer = vi.mocked(api.transfers.create);
const E = (status: number, code = "X", message = "falhou") => new (ApiError as unknown as new (s: number, c: string, m: string) => Error)(status, code, message);

const add = (id: string, kind: "transaction" | "transfer" = "transaction") => useOutbox.getState().enqueue({ id, kind, body: { description: id } });
const ids = () => useOutbox.getState().items.map((i) => i.id);

beforeEach(() => {
  useOutbox.getState().clear();
  createTx.mockReset();
  createTransfer.mockReset();
  vi.mocked(queryClient.invalidateQueries).mockClear();
});

describe("fila offline", () => {
  it("enfileira sem duplicar o mesmo id (o UUID é gerado no aparelho)", () => {
    add("a");
    add("a");
    add("b");
    expect(ids()).toEqual(["a", "b"]);
  });

  it("envia em ordem, com o id como Idempotency-Key, e esvazia a fila", async () => {
    createTx.mockResolvedValue({} as never);
    createTransfer.mockResolvedValue({} as never);
    add("a");
    add("t1", "transfer");
    add("b");
    const synced = await flushOutbox();
    expect(synced).toBe(3);
    expect(ids()).toEqual([]);
    expect(createTx.mock.calls.map((c) => c[1])).toEqual(["a", "b"]);
    expect(createTransfer.mock.calls.map((c) => c[1])).toEqual(["t1"]);
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("ALREADY_PROCESSED (resposta perdida antes) conta como sucesso e não duplica", async () => {
    createTx.mockRejectedValueOnce(E(409, "ALREADY_PROCESSED"));
    createTx.mockResolvedValueOnce({} as never);
    add("a");
    add("b");
    expect(await flushOutbox()).toBe(2);
    expect(ids()).toEqual([]);
  });

  it("recusa definitiva (4xx) marca o item como falho e segue para os próximos", async () => {
    createTx.mockRejectedValueOnce(E(422, "VALIDATION_ERROR", "Conta não encontrada"));
    createTx.mockResolvedValueOnce({} as never);
    add("ruim");
    add("bom");
    expect(await flushOutbox()).toBe(1);
    const left = useOutbox.getState().items;
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ id: "ruim", error: "Conta não encontrada" });
  });

  it.each([
    ["sem rede", 0],
    ["erro do servidor", 503],
    ["sessão expirada", 401],
  ])("%s interrompe o envio e mantém tudo para tentar depois", async (_label, status) => {
    createTx.mockRejectedValueOnce(E(status, "X"));
    add("a");
    add("b");
    expect(await flushOutbox()).toBe(0);
    expect(createTx).toHaveBeenCalledTimes(1); // não insiste nos demais
    expect(ids()).toEqual(["a", "b"]);
    expect(useOutbox.getState().items.every((i) => !i.error)).toBe(true);
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it("itens falhos não são reenviados até o usuário pedir (retry)", async () => {
    createTx.mockRejectedValueOnce(E(422, "VALIDATION_ERROR", "x"));
    add("a");
    await flushOutbox();
    createTx.mockResolvedValue({} as never);
    expect(await flushOutbox()).toBe(0);
    useOutbox.getState().retry("a");
    expect(await flushOutbox()).toBe(1);
    expect(ids()).toEqual([]);
  });

  it("duas descargas simultâneas não enviam o mesmo item duas vezes", async () => {
    let release!: () => void;
    createTx.mockImplementation(() => new Promise((r) => (release = () => r({} as never))));
    add("a");
    const first = flushOutbox();
    expect(await flushOutbox()).toBe(0); // segunda chamada ignorada enquanto a primeira roda
    release();
    expect(await first).toBe(1);
    expect(createTx).toHaveBeenCalledTimes(1);
  });

  it("remove e limpa", () => {
    add("a");
    add("b");
    useOutbox.getState().remove("a");
    expect(ids()).toEqual(["b"]);
    useOutbox.getState().clear();
    expect(ids()).toEqual([]);
  });
});

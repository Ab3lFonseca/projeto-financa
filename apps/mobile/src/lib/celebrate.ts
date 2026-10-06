import type { ReactNode } from "react";
import { create } from "zustand";

/**
 * Comemorações em tela cheia (meta alcançada, dinheiro guardado, insígnia nova, assinatura confirmada...). Quem tem o que comemorar chama
 * `celebrate(...)`; o `CelebrationHost` (montado uma vez na raiz do app) mostra. Se já houver uma na tela, a próxima entra na fila.
 */
export type CelebrationKind = "goal" | "saved" | "badge" | "premium" | "welcome";

export type Celebration = {
  id: number;
  kind: CelebrationKind;
  title: string;
  message?: string;
  /** Ícone do emblema (nome do conjunto do app). Cada tipo tem um padrão. */
  icon?: string;
  /** Valor em destaque, em centavos (conta até o número). */
  amountCents?: number;
  /** Progresso (0 a 100) mostrado como barra, ex.: quanto da meta já foi guardado. */
  progressPct?: number;
  /** Arte própria no lugar do emblema (ex.: a insígnia desenhada). */
  emblem?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
};

type State = {
  current: Celebration | null;
  queue: Celebration[];
  show: (c: Omit<Celebration, "id">) => void;
  dismiss: () => void;
};

let nextId = 1;

export const useCelebrationStore = create<State>((set, get) => ({
  current: null,
  queue: [],
  show: (c) => {
    const item = { ...c, id: nextId++ };
    if (get().current) set((s) => ({ queue: [...s.queue, item] }));
    else set({ current: item });
  },
  dismiss: () => {
    const [next, ...rest] = get().queue;
    set({ current: next ?? null, queue: rest });
  },
}));

export const celebrate = (c: Omit<Celebration, "id">) => useCelebrationStore.getState().show(c);

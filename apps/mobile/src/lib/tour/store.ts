import { create } from "zustand";
import { TOUR_STEPS } from "./steps";

export type TourEnd = "finished" | "skipped";

type TourState = {
  active: boolean;
  /** Etapa atual (0 a TOUR_STEPS.length - 1). */
  index: number;
  /** "steps" = passo a passo; "done" = cartão final de parabéns, depois da última etapa. */
  phase: "steps" | "done";
  /** Como começou: sozinho (primeiro acesso) ou a pedido da pessoa (Mais → Tutorial). */
  source: "auto" | "manual" | null;
  /** Como terminou; o `TourController` grava a conclusão e depois chama `acknowledge`. */
  ended: TourEnd | null;
  start: (source: "auto" | "manual") => void;
  next: () => void;
  back: () => void;
  /** Pular o tutorial: fecha na hora e conta como concluído (a pessoa não precisa ver de novo). */
  skip: () => void;
  /** Fecha o cartão final. */
  close: () => void;
  acknowledge: () => void;
};

const LAST = TOUR_STEPS.length - 1;

export const useTourStore = create<TourState>((set, get) => ({
  active: false,
  index: 0,
  phase: "steps",
  source: null,
  ended: null,
  start: (source) => set({ active: true, index: 0, phase: "steps", source, ended: null }),
  next: () => {
    const s = get();
    if (!s.active || s.phase !== "steps") return;
    if (s.index < LAST) set({ index: s.index + 1 });
    else set({ phase: "done", ended: "finished" }); // concluir já conta; o cartão final só comemora
  },
  back: () => {
    const s = get();
    if (s.active && s.phase === "steps" && s.index > 0) set({ index: s.index - 1 });
  },
  skip: () => {
    if (get().active) set({ active: false, phase: "steps", ended: "skipped" });
  },
  close: () => set({ active: false, phase: "steps", index: 0 }),
  acknowledge: () => set({ ended: null }),
}));

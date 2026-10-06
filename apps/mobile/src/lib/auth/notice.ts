import { create } from "zustand";

/**
 * Aviso para a tela de login, quando a pessoa foi desconectada por segurança (ex.: 3 códigos errados da verificação em duas etapas).
 * Fica até ela tentar entrar de novo.
 */
type LoginNoticeState = { message: string | null; show: (message: string) => void; clear: () => void };

export const useLoginNotice = create<LoginNoticeState>((set) => ({
  message: null,
  show: (message) => set({ message }),
  clear: () => set({ message: null }),
}));

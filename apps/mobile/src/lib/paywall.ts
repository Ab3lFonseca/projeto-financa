import { create } from "zustand";

/**
 * Convite a assinar. O cliente da API o abre sozinho quando o servidor responde `402 SUBSCRIPTION_REQUIRED` (teste grátis acabou e a pessoa
 * tentou criar ou editar algo); o componente `PaywallHost` mostra a folha. Só existe quando a cobrança está ligada no servidor.
 */
type PaywallState = { visible: boolean; show: () => void; hide: () => void };

export const usePaywall = create<PaywallState>((set) => ({
  visible: false,
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
}));

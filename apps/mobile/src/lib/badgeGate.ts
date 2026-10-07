import { create } from "zustand";

/**
 * Faz o primeiro acesso esperar a conferência das insígnias: a comemoração de boas-vindas (primeira insígnia da conta nova) aparece ANTES das
 * perguntas de segurança e do aviso do teste grátis, e não por cima delas. Se a conferência demorar ou falhar (sem rede), o primeiro acesso segue
 * sozinho depois de alguns segundos.
 */
type GateState = { checked: boolean; markChecked: () => void };

export const useBadgeGate = create<GateState>((set) => ({ checked: false, markChecked: () => set({ checked: true }) }));

/** Quanto o primeiro acesso espera pela conferência, no máximo. */
export const BADGE_GATE_TIMEOUT_MS = 3500;

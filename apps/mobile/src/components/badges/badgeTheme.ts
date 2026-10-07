import type { BadgeTier } from "@app/shared";

/** Cores de cada nível. `light`/`mid`/`dark` formam o degradê; `rim` é o contorno; `hi` o realce; `icon` a cor do desenho no centro; `glow` o brilho em volta. */
export type TierStyle = { light: string; mid: string; dark: string; rim: string; hi: string; icon: string; glow: string };

export const TIER_STYLE: Record<BadgeTier, TierStyle> = {
  bronze: { light: "#F6C28B", mid: "#CD7F32", dark: "#7A3E12", rim: "#5A2C0B", hi: "#FFE3C2", icon: "#4A2208", glow: "#E39A57" },
  silver: { light: "#FFFFFF", mid: "#C0C7D1", dark: "#7C8696", rim: "#59626F", hi: "#FFFFFF", icon: "#3A4350", glow: "#C9D1DC" },
  gold: { light: "#FFF1A8", mid: "#FBBF24", dark: "#B7791F", rim: "#8A5A0C", hi: "#FFF8D6", icon: "#6B4204", glow: "#FCD34D" },
  platinum: { light: "#F1F5FB", mid: "#B8C4D6", dark: "#6F7F99", rim: "#4C5A72", hi: "#FFFFFF", icon: "#2E3A50", glow: "#A5B4CF" },
  diamond: { light: "#E0FBFF", mid: "#67E8F9", dark: "#0E7490", rim: "#0B5568", hi: "#FFFFFF", icon: "#FFFFFF", glow: "#22D3EE" },
  // "Roxo pesado": o topo da coleção.
  master: { light: "#A78BFA", mid: "#5B21B6", dark: "#2E1065", rim: "#1E0A47", hi: "#DDD6FE", icon: "#FFFFFF", glow: "#8B5CF6" },
};

/** Insígnia ainda não ganha: cinza, sem brilho. */
export const LOCKED_STYLE: TierStyle = { light: "#4B5563", mid: "#374151", dark: "#1F2937", rim: "#111827", hi: "#6B7280", icon: "#9CA3AF", glow: "#6B7280" };

/** Cor de destaque de um nível (anel de progresso, selos, textos). */
export const tierColor = (tier: BadgeTier): string => TIER_STYLE[tier].mid;

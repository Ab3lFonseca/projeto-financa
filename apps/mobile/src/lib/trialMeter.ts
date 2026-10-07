/**
 * Barra de progressão do teste grátis: quanto do teste já passou, a cor (verde → amarelo → laranja → vermelho → vermelho escuro à medida que o fim
 * chega), e quanto a barra "estremece" e "sua" perto do fim. Tudo função pura do tempo que falta, para ser testável; a animação fica no componente.
 */
export type TrialMeter = {
  /** Fração do teste já usada (0 = começou agora, 1 = acabou). */
  progress: number;
  /** Cor da barra, em #RRGGBB. */
  color: string;
  /** 0 a 1: intensidade do tremor (0 = parada). Começa devagar na segunda metade do teste. */
  shake: number;
  /** 0 a 1: quantas gotas de suor aparecem (0 = nenhuma). Só nos últimos dias. */
  sweat: number;
};

/** Verde no começo, vermelho cada vez mais escuro no fim (o último é bem mais fechado que o vermelho "de alerta"). */
const RAMP: readonly [number, string][] = [
  [0, "#22C55E"],
  [0.4, "#EAB308"],
  [0.65, "#F97316"],
  [0.82, "#EF4444"],
  [1, "#A31D1D"],
];

/** Onde o tremor e o suor começam (fração do teste usada). */
export const SHAKE_FROM = 0.55;
export const SWEAT_FROM = 0.75;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/** Cor da rampa para uma fração do teste (interpola em RGB entre as paradas). */
export function meterColor(progress: number): string {
  const p = clamp01(progress);
  for (let i = 1; i < RAMP.length; i++) {
    const [p1, c1] = RAMP[i]!;
    if (p <= p1) {
      const [p0, c0] = RAMP[i - 1]!;
      const t = p1 === p0 ? 0 : (p - p0) / (p1 - p0);
      return `#${[0, 1, 2].map((k) => toHex(channel(c0, k) + (channel(c1, k) - channel(c0, k)) * t)).join("")}`.toUpperCase();
    }
  }
  return RAMP[RAMP.length - 1]![1];
}

/** Brilho percebido (0 = preto, 1 = branco): usado nos testes para garantir que o vermelho "escurece" até o fim. */
export function luminance(hex: string): number {
  return (0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2)) / 255;
}

/** A barra para `daysLeft` dias restantes de um teste de `trialDays` dias. Valores fora do intervalo são ajustados. */
export function trialMeter(daysLeft: number, trialDays: number): TrialMeter {
  const total = Math.max(1, Math.floor(trialDays));
  const left = Math.min(total, Math.max(0, daysLeft));
  const progress = clamp01(1 - left / total);
  return {
    progress,
    color: meterColor(progress),
    shake: Math.pow(clamp01((progress - SHAKE_FROM) / (1 - SHAKE_FROM)), 1.4),
    sweat: Math.pow(clamp01((progress - SWEAT_FROM) / (1 - SWEAT_FROM)), 1.1),
  };
}

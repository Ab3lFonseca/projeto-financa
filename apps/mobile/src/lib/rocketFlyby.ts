/**
 * Foguetes que cruzam o quadro de cima das Novidades toda vez que a tela abre: de 3 a 5, em alturas diferentes, um depois do outro, bem rápido.
 * O sorteio fica aqui (puro e testável, recebe o gerador de números); a animação é do componente `RocketFlyby`.
 */
export const FLYBY_MIN = 3;
export const FLYBY_MAX = 5;

export type Flight = {
  /** Altura da passagem, em % da altura do quadro (de cima para baixo). */
  topPct: number;
  /** Tamanho do foguete (largura do desenho, em px). */
  size: number;
  /** Atraso até sair, em ms. */
  delayMs: number;
  /** Quanto leva para cruzar o quadro, em ms (bem rápido). */
  durationMs: number;
  /** Inclinação extra da trajetória, em graus (negativo sobe, positivo desce). */
  tiltDeg: number;
};

/** Plano da cena: quantos foguetes e como cada um voa. `random` devolve um número em [0, 1). */
export function flybyPlan(random: () => number = Math.random, count?: number): Flight[] {
  const n = count ?? FLYBY_MIN + Math.floor(random() * (FLYBY_MAX - FLYBY_MIN + 1));
  const total = Math.min(FLYBY_MAX, Math.max(FLYBY_MIN, n));
  const flights: Flight[] = [];
  let at = 250; // o primeiro sai logo depois de a tela abrir
  for (let i = 0; i < total; i++) {
    flights.push({
      topPct: 8 + random() * 70, // sempre dentro do quadro
      size: 20 + random() * 14,
      delayMs: Math.round(at),
      durationMs: Math.round(800 + random() * 350),
      tiltDeg: Math.round(-14 + random() * 28),
    });
    at += 330 + random() * 280; // saem um depois do outro, com intervalos diferentes
  }
  return flights;
}

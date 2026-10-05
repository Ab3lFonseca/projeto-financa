import { useEffect, useRef, type RefObject } from "react";
import type { View } from "react-native";
import type { Rect } from "./geometry";

// Elementos reais da interface que o tutorial pode destacar. Cada tela registra os seus (TourTarget / useTourTarget) ao montar
// e remove ao desmontar; o tutorial só lê daqui, então nenhuma tela precisa saber do tutorial além do id.
const targets = new Map<string, RefObject<View | null>>();

export function registerTarget(id: string, ref: RefObject<View | null>): () => void {
  targets.set(id, ref);
  return () => {
    if (targets.get(id) === ref) targets.delete(id);
  };
}

/** Mede o elemento em relação à janela. null se a tela dele não está montada ou ele não tem tamanho. */
export function measureTarget(id: string): Promise<Rect | null> {
  const node = targets.get(id)?.current;
  if (!node) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      node.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 && Number.isFinite(x) && Number.isFinite(y) ? { x, y, width, height } : null));
    } catch {
      resolve(null);
    }
  });
}

/** Na web, rola a página até o elemento ficar visível. No celular os alvos ficam no topo das telas, então não precisa. */
export function revealTarget(id: string): void {
  const node = targets.get(id)?.current as unknown as { scrollIntoView?: (options: object) => void } | null | undefined;
  node?.scrollIntoView?.({ block: "center", inline: "nearest" });
}

/** Marca um elemento existente como destacável: `const ref = useTourTarget("id"); <Pressable ref={ref} />`. Sem id, não registra nada. */
export function useTourTarget(id: string | null | undefined) {
  const ref = useRef<View>(null);
  useEffect(() => (id ? registerTarget(id, ref) : undefined), [id]);
  return ref;
}

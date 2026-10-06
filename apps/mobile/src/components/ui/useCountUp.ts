import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { countUpValue } from "./countUp";

/**
 * Conta de 0 (ou do valor anterior) até `target` em ~`duration` ms. Pensado para saldos: o número final **sempre**
 * aparece, mesmo se a animação for interrompida (aba em segundo plano, quadros pulados), porque um temporizador de
 * segurança o grava logo depois do fim previsto. Com "reduzir movimento" ou `enabled=false`, mostra direto o valor.
 */
export function useCountUp(target: number, enabled: boolean = true, duration: number = 900): number {
  const reduce = useReducedMotion();
  const animate = enabled && !reduce;
  const [value, setValue] = useState(animate ? 0 : target);
  const shown = useRef(animate ? 0 : target);

  useEffect(() => {
    if (!animate || shown.current === target) {
      shown.current = target;
      setValue(target);
      return;
    }
    const from = shown.current;
    const t0 = Date.now();
    let frame = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const v = countUpValue(from, target, p);
      shown.current = v;
      setValue(v);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const settle = setTimeout(() => {
      shown.current = target;
      setValue(target);
    }, duration + 150);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [target, animate, duration]);

  return value;
}

import type { Appearance, CustomColors, ThemePresetId } from "@app/shared";
import { useThemeStore } from "@/theme/ThemeProvider";
import { legacyThemeFor } from "@/theme/presets";
import { api } from "./api/endpoints";
import { log } from "./logger";

let queue: Promise<void> = Promise.resolve();

/**
 * Guarda o tema na conta (vale em outros aparelhos e depois de sair e entrar). Em fila: quem troca de tema várias vezes seguidas
 * termina com o último no servidor. Falha de rede não atrapalha: o tema já está salvo no aparelho e o próximo clique tenta de novo.
 */
export function saveAppearance(a: Appearance): Promise<void> {
  queue = queue
    .then(() => api.me.update({ theme: legacyThemeFor(a), appearance: a }))
    .then(() => undefined)
    .catch((err) => log.warn("appearance", err));
  return queue;
}

/** Escolher e aplicar temas: muda na hora, no aparelho, e sincroniza com a conta. */
export function useAppearance() {
  const preset = useThemeStore((s) => s.preset);
  const custom = useThemeStore((s) => s.custom);
  const setPreset = useThemeStore((s) => s.setPreset);
  const setCustom = useThemeStore((s) => s.setCustom);

  return {
    preset,
    custom,
    /** Um dos temas prontos (inclui Automático). O personalizado entra por `applyCustom`. */
    choose(id: Exclude<ThemePresetId, "custom">) {
      setPreset(id);
      void saveAppearance({ preset: id, ...(custom ? { custom } : {}) });
    },
    /** Aplica as 4 cores escolhidas e passa a usar o tema personalizado. */
    applyCustom(colors: CustomColors) {
      setCustom(colors);
      setPreset("custom");
      void saveAppearance({ preset: "custom", custom: colors });
    },
  };
}

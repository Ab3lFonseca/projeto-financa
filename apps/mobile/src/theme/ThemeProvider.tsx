import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Appearance, CustomColors, ThemePresetId } from "@app/shared";
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { resolveTheme, type Scheme } from "./presets";
import { radius, spacing, typography, type Palette } from "./tokens";

type ProfileTheme = { theme: "SYSTEM" | "LIGHT" | "DARK"; appearance: Appearance | null };

type ThemeStore = {
  /** Tema escolhido: um dos prontos ("system" segue o aparelho) ou "custom". */
  preset: ThemePresetId;
  /** Cores do tema personalizado. Ficam guardadas mesmo com outro tema ativo (dá para voltar a elas). */
  custom: CustomColors | null;
  setPreset: (p: ThemePresetId) => void;
  setCustom: (c: CustomColors) => void;
  /** Aplica o tema que veio da conta. Sem `appearance`, vale o antigo Sistema/Claro/Escuro. */
  adoptProfile: (p: ProfileTheme) => void;
};

/** Preferência de tema: persistida no aparelho e sincronizada com a conta (veja `lib/appearance.ts`). */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      preset: "system",
      custom: null,
      setPreset: (preset) => set({ preset }),
      setCustom: (custom) => set({ custom }),
      adoptProfile: ({ theme, appearance }) =>
        set((s) =>
          appearance
            ? { preset: appearance.preset, custom: appearance.custom ?? s.custom }
            : { preset: theme === "DARK" ? "dark" : theme === "LIGHT" ? "light" : "system" },
        ),
    }),
    {
      name: "theme-mode",
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ preset: s.preset, custom: s.custom }),
      // v1 guardava só { mode: "system" | "light" | "dark" }: os três valores continuam existindo como presets.
      migrate: (persisted, version) => {
        if (version >= 2) return persisted as ThemeStore;
        const mode = (persisted as { mode?: string } | null)?.mode;
        return { preset: mode === "light" || mode === "dark" ? mode : "system", custom: null } as ThemeStore;
      },
    },
  ),
);

export type Theme = {
  scheme: Scheme;
  preset: ThemePresetId;
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
};

const ThemeContext = createContext<Theme | null>(null);

const TRANSITION_STYLE_ID = "theme-transition-style";
const TRANSITION_CLASS = "theme-transition";

/** Só na web: pinta o fundo da página (sem "flash" ao rolar além do fim), informa o esquema ao navegador e suaviza a troca de tema. */
function useWebThemeEffects(palette: Palette, scheme: Scheme) {
  const first = useRef(true);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.backgroundColor = palette.bg;
    root.style.colorScheme = scheme;
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (!document.getElementById(TRANSITION_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = TRANSITION_STYLE_ID;
      style.textContent = `.${TRANSITION_CLASS}, .${TRANSITION_CLASS} * { transition: background-color .3s ease, border-color .3s ease, color .3s ease, fill .3s ease, stroke .3s ease !important; }`;
      document.head.appendChild(style);
    }
    root.classList.add(TRANSITION_CLASS);
    const timer = setTimeout(() => root.classList.remove(TRANSITION_CLASS), 450);
    return () => clearTimeout(timer);
  }, [palette, scheme]);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system: Scheme = useColorScheme() === "dark" ? "dark" : "light";
  const preset = useThemeStore((s) => s.preset);
  const custom = useThemeStore((s) => s.custom);
  const resolved = resolveTheme(preset, custom, system);
  useWebThemeEffects(resolved.palette, resolved.scheme);

  const value = useMemo<Theme>(
    () => ({ scheme: resolved.scheme, preset, colors: resolved.palette, spacing, radius, typography }),
    [resolved, preset],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Aplica uma paleta só a uma parte da árvore (a pré-visualização da tela Aparência usa os componentes reais do app). */
export function ThemeScope({ palette, scheme, children }: { palette: Palette; scheme: Scheme; children: ReactNode }) {
  const parent = useTheme();
  const value = useMemo<Theme>(() => ({ ...parent, colors: palette, scheme }), [parent, palette, scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error("useTheme fora do ThemeProvider");
  return t;
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { darkPalette, lightPalette, radius, spacing, typography, type Palette } from "./tokens";

export type ThemeMode = "system" | "light" | "dark";

type ThemeStore = { mode: ThemeMode; setMode: (m: ThemeMode) => void };

/** Preferência de tema persistida no aparelho (e sincronizada com o perfil quando há sessão). */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({ mode: "system", setMode: (mode) => set({ mode }) }),
    { name: "theme-mode", storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export type Theme = {
  scheme: "light" | "dark";
  mode: ThemeMode;
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const mode = useThemeStore((s) => s.mode);
  const scheme: "light" | "dark" = mode === "system" ? (system === "dark" ? "dark" : "light") : mode;

  const value = useMemo<Theme>(
    () => ({
      scheme,
      mode,
      colors: scheme === "dark" ? darkPalette : lightPalette,
      spacing,
      radius,
      typography,
    }),
    [scheme, mode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error("useTheme fora do ThemeProvider");
  return t;
}

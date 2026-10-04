import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type PrivacyStore = {
  /** Oculta valores monetários na tela ("modo discreto"). */
  hideAmounts: boolean;
  toggle: () => void;
};

export const usePrivacyStore = create<PrivacyStore>()(
  persist(
    (set) => ({ hideAmounts: false, toggle: () => set((s) => ({ hideAmounts: !s.hideAmounts })) }),
    { name: "privacy-mode", storage: createJSONStorage(() => AsyncStorage) },
  ),
);

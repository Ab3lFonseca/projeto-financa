import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Platform, View } from "react-native";
import { create } from "zustand";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/theme/ThemeProvider";
import { useAuth } from "./auth/AuthProvider";

const KEY = "biometric-lock-v1";
const GRACE_MS = 30_000;

type LockSettings = { enabled: boolean; loaded: boolean; setEnabled: (v: boolean) => Promise<void>; load: () => Promise<void> };

export const useLockSettings = create<LockSettings>((set) => ({
  enabled: false,
  loaded: false,
  setEnabled: async (enabled) => {
    set({ enabled });
    await AsyncStorage.setItem(KEY, enabled ? "1" : "0");
  },
  load: async () => set({ enabled: (await AsyncStorage.getItem(KEY)) === "1", loaded: true }),
}));

export async function biometricsAvailable(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

/**
 * Bloqueio opcional por biometria/senha do aparelho: ao abrir o app e ao voltar depois de
 * 30 s em segundo plano, cobre a tela até o usuário se autenticar.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { enabled, loaded, load } = useLockSettings();
  const [locked, setLocked] = useState(true);
  const leftAt = useRef<number | null>(null);
  const prompting = useRef(false);
  const { colors } = useTheme();

  useEffect(() => {
    void load();
  }, [load]);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: "Desbloquear",
        cancelLabel: "Cancelar",
        fallbackLabel: "Usar senha do aparelho",
      });
      if (res.success) setLocked(false);
    } finally {
      prompting.current = false;
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (!enabled || Platform.OS === "web" || status !== "signedIn") {
      setLocked(false);
      return;
    }
    void unlock(); // abertura a frio
  }, [loaded, enabled, status, unlock]);

  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        leftAt.current ??= Date.now();
      } else if (state === "active") {
        if (leftAt.current && Date.now() - leftAt.current > GRACE_MS) {
          setLocked(true);
          void unlock();
        }
        leftAt.current = null;
      }
    });
    return () => sub.remove();
  }, [enabled, unlock]);

  const showLock = enabled && locked && status === "signedIn" && Platform.OS !== "web";
  return (
    <>
      {children}
      {showLock ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: 20, padding: 32, zIndex: 2000 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
            <Icon name="lock" size={32} color={colors.primary} />
          </View>
          <Text variant="title" align="center">
            App bloqueado
          </Text>
          <Text tone="muted" align="center">
            Use a biometria ou a senha do aparelho para ver seus dados.
          </Text>
          <Button label="Desbloquear" icon="fingerprint" onPress={() => void unlock()} fullWidth={false} />
        </View>
      ) : null}
    </>
  );
}

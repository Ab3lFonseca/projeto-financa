import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useThemeStore } from "@/theme/ThemeProvider";
import { ApiError } from "../api/client";
import { api, type Me, type Session } from "../api/endpoints";
import { useOutbox } from "../offline/outbox";
import { clearLocalCache } from "../query";
import { tokenStore } from "./tokens";

type Status = "loading" | "signedOut" | "signedIn";

type RegisterInput = {
  email: string;
  password: string;
  displayName?: string;
  termsVersion: string;
  privacyVersion: string;
  marketingOptIn: boolean;
};

type AuthContextValue = {
  status: Status;
  me: Me | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Retorna true se o cadastro já abriu sessão; false se exige confirmar o e-mail antes. */
  signUp: (input: RegisterInput) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<Me | null>;
  /** Após exclusão de conta: limpa tudo localmente. */
  wipeLocal: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const ME_CACHE_KEY = "me-cache-v1";

async function applySession(s: Session) {
  await tokenStore.set({ accessToken: s.accessToken, refreshToken: s.refreshToken, expiresAt: s.expiresAt });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const setThemeMode = useThemeStore((s) => s.setMode);

  const adoptMe = useCallback(
    (next: Me) => {
      setMe(next);
      setStatus("signedIn");
      setThemeMode(next.profile.theme === "DARK" ? "dark" : next.profile.theme === "LIGHT" ? "light" : "system");
      void AsyncStorage.setItem(ME_CACHE_KEY, JSON.stringify(next));
    },
    [setThemeMode],
  );

  const wipeLocal = useCallback(async () => {
    await tokenStore.clear();
    await clearLocalCache();
    useOutbox.getState().clear();
    await AsyncStorage.removeItem(ME_CACHE_KEY);
    setMe(null);
    setStatus("signedOut");
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const next = await api.me.get();
      adoptMe(next);
      return next;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.code === "ACCOUNT_DELETED")) await wipeLocal();
      return null;
    }
  }, [adoptMe, wipeLocal]);

  // Abertura do app: reaproveita a sessão guardada. Sem rede, abre com o último perfil conhecido.
  useEffect(() => {
    let alive = true;
    (async () => {
      const tokens = await tokenStore.get();
      if (!tokens) {
        if (alive) setStatus("signedOut");
        return;
      }
      try {
        const next = await api.me.get();
        if (alive) adoptMe(next);
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError && err.status !== 0 && err.status < 500) {
          if (err.status === 401 || err.status === 403) {
            // 403 = conta suspensa/excluindo; 401 = sessão inválida
            await wipeLocal();
            return;
          }
        }
        const cached = await AsyncStorage.getItem(ME_CACHE_KEY);
        if (cached) {
          setMe(JSON.parse(cached) as Me);
          setStatus("signedIn");
        } else {
          setStatus("signedOut");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [adoptMe, wipeLocal]);

  // Sessão revogada no servidor (refresh recusado): volta para o login.
  useEffect(() => tokenStore.onExpired(() => void wipeLocal()), [wipeLocal]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      // Evita misturar dados entre contas no mesmo aparelho.
      await clearLocalCache();
      useOutbox.getState().clear();
      const session = await api.auth.login(email.trim(), password);
      await applySession(session);
      adoptMe(await api.me.get());
    },
    [adoptMe],
  );

  const signUp = useCallback(
    async (input: RegisterInput) => {
      const res = await api.auth.register({
        email: input.email.trim(),
        password: input.password,
        displayName: input.displayName,
        acceptTerms: true,
        acceptPrivacy: true,
        termsVersion: input.termsVersion,
        privacyVersion: input.privacyVersion,
        marketingOptIn: input.marketingOptIn,
      });
      if (res.session) {
        await clearLocalCache();
        useOutbox.getState().clear();
        await applySession(res.session);
        adoptMe(await api.me.get());
        return true;
      }
      return false;
    },
    [adoptMe],
  );

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* sem rede: o logout local basta */
    }
    await wipeLocal();
  }, [wipeLocal]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, me, signIn, signUp, signOut, refreshMe, wipeLocal }),
    [status, me, signIn, signUp, signOut, refreshMe, wipeLocal],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}

/** Usuário logado (só use em telas protegidas). */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error("useMe sem sessão");
  return me;
}

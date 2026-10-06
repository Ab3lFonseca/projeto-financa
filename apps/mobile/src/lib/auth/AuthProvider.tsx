import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useThemeStore } from "@/theme/ThemeProvider";
import { ApiError } from "../api/client";
import { api, type LoginResult, type Me, type Session } from "../api/endpoints";
import { useOutbox } from "../offline/outbox";
import { clearLocalCache } from "../query";
import { tokenStore } from "./tokens";

/** "mfa" = a senha já foi aceita, mas a conta tem verificação em duas etapas e falta digitar o código. */
type Status = "loading" | "signedOut" | "mfa" | "signedIn";

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
  /** Fator a confirmar enquanto `status` é "mfa". */
  mfa: { factorId: string } | null;
  /** `mfaRequired: true` = ainda falta o código (mande a pessoa para a tela de código). */
  signIn: (email: string, password: string) => Promise<{ mfaRequired: boolean }>;
  /** Fecha o login de uma conta com verificação em duas etapas. */
  completeMfa: (code: string) => Promise<void>;
  /** Fecha o login por outra conta (Google, Facebook...) com o código devolvido pelo provedor. */
  signInWithOAuth: (code: string, verifier: string) => Promise<{ mfaRequired: boolean }>;
  /** Troca a sessão atual por outra (ex.: a já verificada, devolvida ao ligar a verificação em duas etapas) e relê a conta. */
  adoptSession: (session: Session) => Promise<void>;
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

/** O servidor recusou porque falta o código da verificação em duas etapas? Devolve o fator (ou null se a resposta não o trouxe). */
function mfaFactorOf(err: unknown): { factorId: string } | null | undefined {
  if (!(err instanceof ApiError) || err.code !== "MFA_REQUIRED") return undefined;
  const factorId = (err.details as { factorId?: string | null } | undefined)?.factorId;
  return factorId ? { factorId } : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [mfa, setMfa] = useState<{ factorId: string } | null>(null);
  const adoptTheme = useThemeStore((s) => s.adoptProfile);

  const adoptMe = useCallback(
    (next: Me) => {
      setMe(next);
      setMfa(null);
      setStatus("signedIn");
      adoptTheme(next.profile);
      void AsyncStorage.setItem(ME_CACHE_KEY, JSON.stringify(next));
    },
    [adoptTheme],
  );

  const needCode = useCallback((factor: { factorId: string } | null) => {
    setMe(null);
    setMfa(factor);
    setStatus("mfa");
  }, []);

  const wipeLocal = useCallback(async () => {
    await tokenStore.clear();
    await clearLocalCache();
    useOutbox.getState().clear();
    await AsyncStorage.removeItem(ME_CACHE_KEY);
    setMe(null);
    setMfa(null);
    setStatus("signedOut");
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const next = await api.me.get();
      adoptMe(next);
      return next;
    } catch (err) {
      const factor = mfaFactorOf(err);
      if (factor !== undefined) needCode(factor);
      else if (err instanceof ApiError && (err.status === 401 || err.code === "ACCOUNT_DELETED")) await wipeLocal();
      return null;
    }
  }, [adoptMe, needCode, wipeLocal]);

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
        const factor = mfaFactorOf(err);
        if (factor !== undefined) {
          needCode(factor);
          return;
        }
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
  }, [adoptMe, needCode, wipeLocal]);

  // Sessão revogada no servidor (refresh recusado): volta para o login.
  useEffect(() => tokenStore.onExpired(() => void wipeLocal()), [wipeLocal]);
  // A conta passou a exigir o código (ligado em outro aparelho): a tela de código assume.
  useEffect(() => tokenStore.onMfaRequired((factorId) => needCode(factorId ? { factorId } : null)), [needCode]);

  /** Guarda a sessão recebida e abre a conta, ou pede o código se a conta tiver verificação em duas etapas. */
  const startSession = useCallback(
    async (res: LoginResult): Promise<{ mfaRequired: boolean }> => {
      await applySession(res);
      if (res.mfa) {
        needCode(res.mfa);
        return { mfaRequired: true };
      }
      adoptMe(await api.me.get());
      return { mfaRequired: false };
    },
    [adoptMe, needCode],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      // Evita misturar dados entre contas no mesmo aparelho.
      await clearLocalCache();
      useOutbox.getState().clear();
      return startSession(await api.auth.login(email.trim(), password));
    },
    [startSession],
  );

  const signInWithOAuth = useCallback(
    async (code: string, verifier: string) => {
      await clearLocalCache();
      useOutbox.getState().clear();
      return startSession(await api.auth.oauthExchange(code, verifier));
    },
    [startSession],
  );

  const completeMfa = useCallback(
    async (code: string) => {
      if (!mfa) throw new ApiError(0, "NO_PENDING_MFA", "Não há verificação pendente.");
      const session = await api.auth.mfaVerify(mfa.factorId, code);
      await applySession(session);
      adoptMe(await api.me.get());
    },
    [mfa, adoptMe],
  );

  const adoptSession = useCallback(
    async (session: Session) => {
      await applySession(session);
      await refreshMe();
    },
    [refreshMe],
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
    () => ({ status, me, mfa, signIn, completeMfa, signInWithOAuth, adoptSession, signUp, signOut, refreshMe, wipeLocal }),
    [status, me, mfa, signIn, completeMfa, signInWithOAuth, adoptSession, signUp, signOut, refreshMe, wipeLocal],
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

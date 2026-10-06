import { secureStorage } from "../storage";

export type Tokens = { accessToken: string; refreshToken: string; /** epoch em segundos */ expiresAt: number };

const KEY = "session-v1";
let cache: Tokens | null | undefined;
const listeners = new Set<() => void>();
const mfaListeners = new Set<(factorId: string | null) => void>();

/** Tokens de sessão: guardados no Keychain/Keystore (SecureStore), com cópia em memória. */
export const tokenStore = {
  async get(): Promise<Tokens | null> {
    if (cache !== undefined) return cache;
    const raw = await secureStorage.get(KEY);
    try {
      cache = raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      cache = null;
    }
    return cache;
  },
  async set(tokens: Tokens): Promise<void> {
    cache = tokens;
    await secureStorage.set(KEY, JSON.stringify(tokens));
  },
  async clear(): Promise<void> {
    cache = null;
    await secureStorage.remove(KEY);
  },
  /** Avisado quando o refresh falha de vez (sessão encerrada no servidor). */
  onExpired(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  notifyExpired(): void {
    listeners.forEach((l) => l());
  },
  /** Avisado quando o servidor diz que esta sessão ainda precisa do código da verificação em duas etapas (ex.: ligada em outro aparelho). */
  onMfaRequired(listener: (factorId: string | null) => void): () => void {
    mfaListeners.add(listener);
    return () => mfaListeners.delete(listener);
  },
  notifyMfaRequired(factorId: string | null): void {
    mfaListeners.forEach((l) => l(factorId));
  },
};

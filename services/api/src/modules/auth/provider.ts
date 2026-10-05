/**
 * Porta de autenticação. Hoje implementada pelo Supabase Auth; trocar de provedor
 * (Auth0, Cognito...) significa escrever outro adapter, sem tocar nas rotas.
 *
 * O servidor NUNCA persiste senhas: elas só passam pela requisição, em memória,
 * rumo ao provedor, e jamais são logadas.
 */
export type ProviderSession = {
  accessToken: string;
  refreshToken: string;
  /** Segundos até expirar. */
  expiresIn: number;
  /** Epoch em segundos. */
  expiresAt: number;
  user: { id: string; email: string };
};

export type SignUpResult = {
  /** Pode ser null quando o provedor oculta a existência do e-mail (anti-enumeração). */
  userId: string | null;
  session: ProviderSession | null;
  requiresEmailVerification: boolean;
};

export interface AuthProvider {
  /** `redirectTo`: para onde o link do e-mail de confirmação leva (precisa estar liberado no provedor). */
  signUp(input: { email: string; password: string; metadata: Record<string, unknown>; redirectTo?: string }): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<ProviderSession>;
  refresh(refreshToken: string): Promise<ProviderSession>;
  signOut(accessToken: string, scope?: "global" | "local" | "others"): Promise<void>;
  requestPasswordReset(email: string, redirectTo?: string): Promise<void>;
  resendVerification(email: string, redirectTo?: string): Promise<void>;
  /** Troca a senha do usuário dono do token (usado também no fluxo de recuperação). */
  updatePassword(accessToken: string, newPassword: string): Promise<void>;
  /** Remove o usuário do provedor (exclusão de conta — LGPD). */
  deleteUser(userId: string): Promise<void>;
}

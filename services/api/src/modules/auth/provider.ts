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

/** Fator TOTP recém-criado: o segredo e o QR aparecem só uma vez, para a pessoa cadastrar no aplicativo autenticador. */
export type MfaEnrollment = {
  factorId: string;
  secret: string;
  uri: string;
  qrSvg: string;
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

  /**
   * Pede a troca do e-mail do dono do token. O provedor envia um link de confirmação ao endereço NOVO (e, conforme a configuração, ao antigo);
   * o e-mail só muda depois da confirmação. Endereço já usado por outra conta NÃO é revelado: conta como sucesso (anti-enumeração).
   */
  requestEmailChange(accessToken: string, newEmail: string, redirectTo?: string): Promise<void>;

  // ---- verificação em duas etapas (TOTP) ----
  /** Cria um fator TOTP ainda não confirmado (apaga antes os que ficaram pela metade). */
  mfaEnroll(accessToken: string): Promise<MfaEnrollment>;
  /** Confere o código do autenticador. Devolve a sessão nova, já no nível aal2. Código errado: 422 `INVALID_MFA_CODE`. */
  mfaVerify(accessToken: string, factorId: string, code: string): Promise<ProviderSession>;
  /** Desliga a verificação (exige sessão aal2). */
  mfaUnenroll(accessToken: string, factorId: string): Promise<void>;
  /** Suporte: remove TODOS os fatores de um usuário (perdeu o aparelho), sem precisar do código dele. */
  adminRemoveMfa(userId: string): Promise<void>;

  // ---- cadastro e login por outras contas (Google, Facebook...) ----
  /** Endereço do provedor que inicia o login (PKCE). O desafio vem do aparelho; o segredo (verifier) fica lá até a troca. */
  oauthAuthorizeUrl(input: { provider: string; redirectTo: string; codeChallenge: string }): string;
  /** Troca o código devolvido pelo provedor (e o verifier PKCE) por uma sessão. */
  oauthExchange(code: string, codeVerifier: string): Promise<ProviderSession>;
}

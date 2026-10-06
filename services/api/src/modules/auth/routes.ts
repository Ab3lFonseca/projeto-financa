import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  errorResponse,
  forgotPasswordBody,
  loginBody,
  loginResponse,
  mfaSessionResponse,
  mfaVerifyBody,
  oauthExchangeBody,
  oauthProvidersDTO,
  oauthStartBody,
  oauthStartResponse,
  OAUTH_PROVIDERS,
  okResponse,
  refreshBody,
  registerBody,
  registerResponse,
  resendVerificationBody,
  resetPasswordBody,
  sessionResponse,
} from "@app/shared";
import { audit } from "../../lib/audit";
import { AppError, Errors } from "../../lib/errors";
import { checkMfaCode } from "./mfa-attempts";

const STRICT = (max: number) => ({ rateLimit: { max, timeWindow: "1 minute" } });

/**
 * Rotas públicas de autenticação. As senhas só atravessam a API rumo ao provedor
 * (TLS), em memória: nunca são persistidas nem logadas.
 */
export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const { authProvider: provider, config } = app;
  // Destino do link do e-mail de confirmação: SEMPRE vem da configuração (nunca do cliente), conforme a plataforma do app.
  const confirmRedirect = (platform?: "native" | "web") => (platform === "web" ? config.EMAIL_CONFIRM_WEB_REDIRECT_URL : config.EMAIL_CONFIRM_REDIRECT_URL);

  app.post(
    "/register",
    {
      config: STRICT(5),
      schema: { tags: ["auth"], security: [], body: registerBody, response: { 201: registerResponse } },
    },
    async (req, reply) => {
      const b = req.body;
      const result = await provider.signUp({
        redirectTo: confirmRedirect(b.platform),
        email: b.email,
        password: b.password,
        // Os aceites viajam como metadados do usuário e viram registros de consentimento
        // (tabela consents) no primeiro acesso.
        metadata: {
          display_name: b.displayName ?? null,
          terms_version: b.termsVersion,
          privacy_version: b.privacyVersion,
          marketing_opt_in: b.marketingOptIn,
          accepted_at: app.clock().toISOString(),
        },
      });
      await audit(app.prisma, config.IP_HASH_PEPPER, { actorId: result.userId, action: "auth.register", ip: req.ip }, req.log);
      return reply.code(201).send({
        requiresEmailVerification: result.requiresEmailVerification,
        session: result.session,
      });
    },
  );

  /**
   * A conta tem verificação em duas etapas? Então o login ainda não terminou: a sessão devolvida só digitou a senha (aal1) e o app precisa
   * pedir o código (POST /mfa/verify) antes de abrir a conta. A API também recusa qualquer rota com essa sessão (401 MFA_REQUIRED).
   */
  const withMfa = async <T extends { user: { id: string } }>(session: T) => {
    const row = await app.prisma.user.findUnique({ where: { id: session.user.id }, select: { mfaFactorId: true, mfaEnabledAt: true } });
    return { ...session, mfa: row?.mfaFactorId && row.mfaEnabledAt ? { factorId: row.mfaFactorId } : null };
  };

  app.post(
    "/login",
    {
      config: STRICT(10),
      schema: { tags: ["auth"], security: [], body: loginBody, response: { 200: loginResponse } },
    },
    async (req) => {
      try {
        const session = await provider.signIn(req.body.email, req.body.password);
        await audit(app.prisma, config.IP_HASH_PEPPER, { actorId: session.user.id, action: "auth.login", ip: req.ip }, req.log);
        return await withMfa(session);
      } catch (err) {
        if (err instanceof AppError && err.code === "INVALID_CREDENTIALS") {
          await audit(app.prisma, config.IP_HASH_PEPPER, { action: "auth.login_failed", ip: req.ip }, req.log);
        }
        throw err;
      }
    },
  );

  // Segundo passo do login com verificação em duas etapas: troca a sessão "só senha" por uma verificada (aal2) com o código do aplicativo
  // autenticador. Aceita a sessão aal1 de propósito (é para isso que ela existe). No 3º código errado a sessão é encerrada e a verificação
  // trava por 15 minutos (o contador não zera ao entrar de novo com a senha).
  app.post(
    "/mfa/verify",
    { config: STRICT(8), schema: { tags: ["auth"], body: mfaVerifyBody, response: { 200: mfaSessionResponse, 422: errorResponse } } },
    async (req) => {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) throw Errors.unauthorized("Sessão inválida", "INVALID_TOKEN");
      const token = header.slice(7).trim();
      const claims = await app.tokenVerifier.verify(token);
      const row = await app.prisma.user.findUnique({ where: { id: claims.sub }, select: { mfaFactorId: true } });
      if (!row?.mfaFactorId || row.mfaFactorId !== req.body.factorId) {
        throw Errors.forbidden("A verificação em duas etapas não está ligada para esta conta.", "MFA_NOT_ENABLED");
      }
      const session = await checkMfaCode(app, { userId: claims.sub, token, ip: req.ip, log: req.log }, () => provider.mfaVerify(token, req.body.factorId, req.body.code));
      await audit(app.prisma, config.IP_HASH_PEPPER, { actorId: claims.sub, action: "auth.mfa_verified", ip: req.ip, at: app.clock() }, req.log);
      return session;
    },
  );

  // ---------------------------------------------------------------------------------------------- cadastro e login por outras contas

  // Quais botões o app mostra: só os provedores ligados neste servidor (vazio = só e-mail e senha).
  app.get("/oauth/providers", { schema: { tags: ["auth"], security: [], response: { 200: oauthProvidersDTO } } }, async () => ({
    providers: OAUTH_PROVIDERS.filter((p) => config.OAUTH_PROVIDERS.includes(p.id)).map((p) => ({ id: p.id, label: p.label })),
  }));

  // Passo 1: o aparelho gera um segredo (verifier), manda só o desafio (SHA-256 dele) e recebe o endereço do provedor para abrir.
  // O endereço de retorno vem da configuração, nunca do cliente (sem redirecionamento aberto).
  app.post(
    "/oauth/start",
    { config: STRICT(20), schema: { tags: ["auth"], security: [], body: oauthStartBody, response: { 200: oauthStartResponse } } },
    async (req) => {
      if (!config.OAUTH_PROVIDERS.includes(req.body.provider)) throw Errors.notFound("Provedor de login");
      const redirectTo = req.body.platform === "web" ? config.OAUTH_WEB_REDIRECT_URL : config.OAUTH_REDIRECT_URL;
      if (!redirectTo) throw Errors.unavailable("O login por outras contas não está disponível nesta plataforma.", "OAUTH_NOT_CONFIGURED");
      return { url: provider.oauthAuthorizeUrl({ provider: req.body.provider, redirectTo, codeChallenge: req.body.codeChallenge }) };
    },
  );

  // Passo 2: o provedor devolveu um código; trocamos por uma sessão com o verifier (só quem iniciou o login consegue). Conta nova é
  // criada no primeiro acesso e cai na tela de aceite dos Termos, como no cadastro por e-mail.
  app.post(
    "/oauth/exchange",
    { config: STRICT(20), schema: { tags: ["auth"], security: [], body: oauthExchangeBody, response: { 200: loginResponse } } },
    async (req) => {
      const session = await provider.oauthExchange(req.body.code, req.body.codeVerifier);
      await audit(app.prisma, config.IP_HASH_PEPPER, { actorId: session.user.id, action: "auth.login_oauth", ip: req.ip }, req.log);
      return withMfa(session);
    },
  );

  app.post(
    "/refresh",
    {
      config: STRICT(30),
      schema: { tags: ["auth"], security: [], body: refreshBody, response: { 200: sessionResponse } },
    },
    async (req) => provider.refresh(req.body.refreshToken),
  );

  // Logout: revoga os refresh tokens no provedor. Se o token já expirou, o app apenas
  // descarta a sessão localmente: respondemos ok para não prender o usuário.
  app.post(
    "/logout",
    { config: STRICT(30), schema: { tags: ["auth"], response: { 200: okResponse } } },
    async (req) => {
      const header = req.headers.authorization;
      const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
      if (token) {
        try {
          await provider.signOut(token, "global");
        } catch (err) {
          if (!(err instanceof AppError) || err.status >= 500) throw err;
        }
      }
      return { ok: true as const };
    },
  );

  // Resposta idêntica exista ou não a conta (anti-enumeração de e-mails).
  app.post(
    "/forgot-password",
    { config: STRICT(3), schema: { tags: ["auth"], security: [], body: forgotPasswordBody, response: { 200: okResponse } } },
    async (req) => {
      try {
        await provider.requestPasswordReset(req.body.email, config.PASSWORD_RESET_REDIRECT_URL);
      } catch (err) {
        if (err instanceof AppError && (err.status === 429 || err.status >= 500)) throw err;
      }
      return { ok: true as const };
    },
  );

  app.post(
    "/resend-verification",
    { config: STRICT(3), schema: { tags: ["auth"], security: [], body: resendVerificationBody, response: { 200: okResponse } } },
    async (req) => {
      try {
        await provider.resendVerification(req.body.email, confirmRedirect(req.body.platform));
      } catch (err) {
        if (err instanceof AppError && (err.status === 429 || err.status >= 500)) throw err;
      }
      return { ok: true as const };
    },
  );

  // Conclui a recuperação: o app chega aqui com a sessão temporária aberta pelo link do e-mail.
  app.post(
    "/reset-password",
    {
      config: STRICT(5),
      schema: { tags: ["auth"], body: resetPasswordBody, response: { 200: okResponse, 401: errorResponse } },
    },
    async (req) => {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) throw Errors.unauthorized("Link de recuperação inválido ou expirado", "INVALID_TOKEN");
      await provider.updatePassword(header.slice(7).trim(), req.body.password);
      await audit(app.prisma, config.IP_HASH_PEPPER, { action: "auth.password_reset", ip: req.ip }, req.log);
      return { ok: true as const };
    },
  );
};

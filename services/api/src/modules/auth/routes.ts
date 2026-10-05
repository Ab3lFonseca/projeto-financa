import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  errorResponse,
  forgotPasswordBody,
  loginBody,
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

  app.post(
    "/login",
    {
      config: STRICT(10),
      schema: { tags: ["auth"], security: [], body: loginBody, response: { 200: sessionResponse } },
    },
    async (req) => {
      try {
        const session = await provider.signIn(req.body.email, req.body.password);
        await audit(app.prisma, config.IP_HASH_PEPPER, { actorId: session.user.id, action: "auth.login", ip: req.ip }, req.log);
        return session;
      } catch (err) {
        if (err instanceof AppError && err.code === "INVALID_CREDENTIALS") {
          await audit(app.prisma, config.IP_HASH_PEPPER, { action: "auth.login_failed", ip: req.ip }, req.log);
        }
        throw err;
      }
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

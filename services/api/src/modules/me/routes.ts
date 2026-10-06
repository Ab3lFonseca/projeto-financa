import { Prisma } from "@app/database";
import {
  myAccountDTO,
  changeEmailBody,
  changeEmailResponse,
  changePasswordBody,
  deleteAccountBody,
  errorResponse,
  meDTO,
  mfaDisableBody,
  mfaEnrollDTO,
  mfaVerifyBody,
  notificationPrefs,
  okResponse,
  pushTokenBody,
  sessionResponse,
  updateProfileBody,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { audit } from "../../lib/audit";
import { runAs, runMutation } from "../../lib/db";
import { AppError, Errors } from "../../lib/errors";
import { checkMfaCode } from "../auth/mfa-attempts";
import { beforeEraseOf } from "../privacy/before-erase";
import { eraseAccount } from "../privacy/service";
import { assertCanChange, buildAccount, hasPasswordOf, recordChange, requireRecentLogin } from "./account";
import { buildMe } from "./service";

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  const { config } = app;
  // Destino do link do e-mail de confirmação: SEMPRE da configuração (nunca do cliente), conforme a plataforma do app.
  const confirmRedirect = (platform?: "native" | "web") => (platform === "web" ? config.EMAIL_CONFIRM_WEB_REDIRECT_URL : config.EMAIL_CONFIRM_REDIRECT_URL);

  /** Confere a senha atual (reautenticação). Senha errada vira 422 WRONG_PASSWORD. */
  const checkPassword = async (email: string, password: string | undefined) => {
    if (!password) throw Errors.unprocessable("Informe sua senha", "WRONG_PASSWORD");
    try {
      await app.authProvider.signIn(email, password);
    } catch (err) {
      if (err instanceof AppError && err.code === "INVALID_CREDENTIALS") throw Errors.unprocessable("Senha incorreta", "WRONG_PASSWORD");
      throw err;
    }
  };

  app.get("/", { schema: { tags: ["me"], response: { 200: meDTO } } }, async (req) =>
    runAs(req, (tx, user) => buildMe(tx, user, config, req.claims)),
  );

  app.patch(
    "/",
    { schema: { tags: ["me"], body: updateProfileBody, response: { 200: meDTO } } },
    async (req) => {
      const body = req.body;
      const { me, nameChanged } = await runMutation(req, async (tx, user) => {
        const current = await tx.profile.findUnique({ where: { userId: user.id } });
        if (!current) throw Errors.notFound("Perfil");
        // Trocar o nome tem limite por mês e por ano. Definir o nome pela primeira vez (ainda não havia) não conta.
        const renamed = body.displayName !== undefined && body.displayName !== current.displayName && current.displayName !== null;
        if (renamed) await assertCanChange(app.prisma, user.id, "NAME", app.clock());
        const prefs = notificationPrefs.parse({
          ...(current.notificationPrefs as object),
          ...(body.notificationPrefs ?? {}),
        });
        await tx.profile.update({
          where: { userId: user.id },
          data: {
            ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
            ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
            ...(body.theme !== undefined ? { theme: body.theme } : {}),
            ...(body.appearance !== undefined ? { appearance: body.appearance === null ? Prisma.DbNull : body.appearance } : {}),
            ...(body.onboardingCompleted !== undefined
              ? { onboardingCompletedAt: body.onboardingCompleted ? (current.onboardingCompletedAt ?? app.clock()) : null }
              : {}),
            notificationPrefs: prefs,
          },
        });
        return { me: user, nameChanged: renamed };
      });
      if (nameChanged) await recordChange(app.prisma, me.id, "NAME", app.clock());
      app.users.invalidate(me.id);
      const fresh = await app.users.resolve({
        sub: me.id,
        email: me.email,
        emailVerified: true,
        userMetadata: {},
        expiresAt: 0,
        aal: req.claims?.aal ?? "aal1",
        providers: req.claims?.providers ?? [],
        authenticatedAt: req.claims?.authenticatedAt ?? 0,
      });
      return runAs(req, (tx) => buildMe(tx, fresh, config, req.claims));
    },
  );

  // ------------------------------------------------------------------------------------------------ Minha conta

  // Dados de cadastro da própria pessoa, o que ela pode trocar e quantas vezes ainda pode.
  app.get("/account", { schema: { tags: ["me"], response: { 200: myAccountDTO } } }, async (req) =>
    runAs(req, (tx, user) => buildAccount(app.prisma, tx, user, req.claims, app.clock())),
  );

  // Troca de e-mail: exige a senha e o endereço novo precisa confirmar um link. O e-mail só muda depois disso.
  app.post(
    "/change-email",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
      schema: { tags: ["me"], body: changeEmailBody, response: { 200: changeEmailResponse, 422: errorResponse } },
    },
    async (req) => {
      const user = req.user!;
      if (!hasPasswordOf(req.claims)) {
        throw Errors.conflict("O e-mail desta conta pertence ao provedor de login (Google, Facebook...) e é alterado lá.", "EMAIL_MANAGED_BY_PROVIDER");
      }
      if (req.body.newEmail === user.email) throw Errors.unprocessable("Este já é o seu e-mail.", "SAME_EMAIL");
      await checkPassword(user.email, req.body.password);
      await assertCanChange(app.prisma, user.id, "EMAIL", app.clock());
      await app.authProvider.requestEmailChange(req.accessToken!, req.body.newEmail, confirmRedirect(req.body.platform));
      await recordChange(app.prisma, user.id, "EMAIL", app.clock());
      await audit(app.prisma, config.IP_HASH_PEPPER, { actorId: user.id, action: "account.email_change_requested", entity: "user", entityId: user.id, ip: req.ip }, req.log);
      return { ok: true as const, pendingEmail: req.body.newEmail };
    },
  );

  // Troca de senha exige a senha atual (reautenticação) e encerra as outras sessões. Quem entrou só por Google/Facebook ainda não tem
  // senha: define a primeira, desde que o login seja recente.
  app.post(
    "/change-password",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: { tags: ["me"], body: changePasswordBody, response: { 200: okResponse, 422: errorResponse } },
    },
    async (req) => {
      const user = req.user!;
      if (hasPasswordOf(req.claims)) await checkPassword(user.email, req.body.currentPassword);
      else requireRecentLogin(req.claims, app.clock());
      await assertCanChange(app.prisma, user.id, "PASSWORD", app.clock());
      // Usa a sessão desta requisição (com a verificação em duas etapas, é a única aceita pelo provedor para trocar a senha).
      await app.authProvider.updatePassword(req.accessToken!, req.body.newPassword);
      await app.authProvider.signOut(req.accessToken!, "others").catch(() => undefined);
      await recordChange(app.prisma, user.id, "PASSWORD", app.clock());
      await audit(app.prisma, config.IP_HASH_PEPPER, { actorId: user.id, action: "auth.password_changed", ip: req.ip }, req.log);
      return { ok: true as const };
    },
  );

  // Manda para o próprio e-mail o link de redefinição de senha (quem esqueceu a senha atual ou prefere trocar por link).
  app.post(
    "/reset-link",
    { config: { rateLimit: { max: 3, timeWindow: "1 hour" } }, schema: { tags: ["me"], response: { 200: okResponse } } },
    async (req) => {
      const user = req.user!;
      if (!hasPasswordOf(req.claims)) throw Errors.conflict("Esta conta ainda não tem senha. Defina uma em Alterar senha.", "NO_PASSWORD");
      await app.authProvider.requestPasswordReset(user.email, config.PASSWORD_RESET_REDIRECT_URL);
      await audit(app.prisma, config.IP_HASH_PEPPER, { actorId: user.id, action: "auth.reset_link_requested", ip: req.ip }, req.log);
      return { ok: true as const };
    },
  );

  // Primeiro acesso: a pergunta "ativar a verificação em duas etapas?" e o aviso do teste grátis saem uma vez só.
  app.post("/security-prompt", { schema: { tags: ["me"], response: { 200: okResponse } } }, async (req) => {
    await app.prisma.profile.updateMany({ where: { userId: req.user!.id, securityPromptAnsweredAt: null }, data: { securityPromptAnsweredAt: app.clock() } });
    return { ok: true as const };
  });
  app.post("/trial-intro-seen", { schema: { tags: ["me"], response: { 200: okResponse } } }, async (req) => {
    await app.prisma.profile.updateMany({ where: { userId: req.user!.id, trialIntroSeenAt: null }, data: { trialIntroSeenAt: app.clock() } });
    return { ok: true as const };
  });

  // ------------------------------------------------------------------------------------------------ verificação em duas etapas

  // 1) Cria o fator e devolve o QR e a chave para cadastrar no aplicativo autenticador. Ainda não vale nada até o passo 2.
  app.post(
    "/mfa/enroll",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } }, schema: { tags: ["me"], response: { 200: mfaEnrollDTO } } },
    async (req) => {
      if (req.user!.mfaEnabled) throw Errors.conflict("A verificação em duas etapas já está ligada.", "MFA_ALREADY_ENABLED");
      return app.authProvider.mfaEnroll(req.accessToken!);
    },
  );

  // 2) Confirma com o primeiro código. Só a partir daqui a conta passa a exigir o código no login. Devolve a sessão nova (já verificada).
  app.post(
    "/mfa/enable",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } }, schema: { tags: ["me"], body: mfaVerifyBody, response: { 200: sessionResponse, 422: errorResponse } } },
    async (req) => {
      const user = req.user!;
      if (user.mfaEnabled) throw Errors.conflict("A verificação em duas etapas já está ligada.", "MFA_ALREADY_ENABLED");
      const session = await app.authProvider.mfaVerify(req.accessToken!, req.body.factorId, req.body.code);
      await app.prisma.user.update({ where: { id: user.id }, data: { mfaFactorId: req.body.factorId, mfaEnabledAt: app.clock() } });
      app.users.invalidate(user.id);
      await audit(app.prisma, config.IP_HASH_PEPPER, { actorId: user.id, action: "auth.mfa_enabled", entity: "user", entityId: user.id, ip: req.ip }, req.log);
      return session;
    },
  );

  // Desligar exige um código válido agora (provar que a pessoa tem o aparelho, e não só a sessão aberta).
  app.post(
    "/mfa/disable",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } }, schema: { tags: ["me"], body: mfaDisableBody, response: { 200: okResponse, 422: errorResponse } } },
    async (req) => {
      const user = req.user!;
      const factorId = user.mfaFactorId;
      if (!user.mfaEnabled || !factorId) throw Errors.conflict("A verificação em duas etapas não está ligada.", "MFA_NOT_ENABLED");
      // Mesmo limite do login: 3 códigos errados encerram a sessão (quem só roubou o aparelho aberto não consegue adivinhar o código).
      const session = await checkMfaCode(app, { userId: user.id, token: req.accessToken!, ip: req.ip, log: req.log }, () => app.authProvider.mfaVerify(req.accessToken!, factorId, req.body.code));
      await app.authProvider.mfaUnenroll(session.accessToken, factorId);
      await app.prisma.user.update({ where: { id: user.id }, data: { mfaFactorId: null, mfaEnabledAt: null } });
      app.users.invalidate(user.id);
      await audit(app.prisma, config.IP_HASH_PEPPER, { actorId: user.id, action: "auth.mfa_disabled", entity: "user", entityId: user.id, ip: req.ip }, req.log);
      return { ok: true as const };
    },
  );

  // Exclusão definitiva da conta e de todos os dados (LGPD). Exige a senha (ou, sem senha, um login recente): é irreversível.
  app.delete(
    "/",
    {
      config: { rateLimit: { max: 3, timeWindow: "1 hour" } },
      schema: { tags: ["me"], body: deleteAccountBody, response: { 200: okResponse, 422: errorResponse } },
    },
    async (req) => {
      const user = req.user!;
      if (hasPasswordOf(req.claims)) await checkPassword(user.email, req.body.password);
      else requireRecentLogin(req.claims, app.clock());
      await eraseAccount(user.id, {
        prisma: app.prisma,
        authProvider: app.authProvider,
        pepper: config.IP_HASH_PEPPER,
        now: app.clock,
        log: req.log,
        // Conexões bancárias e a assinatura precisam ser encerradas nos provedores ANTES de apagar os registros.
        beforeErase: beforeEraseOf(app),
      });
      app.users.invalidate(user.id);
      return { ok: true as const };
    },
  );

  // Token de push do aparelho (Expo). Um token pertence a um único usuário por vez.
  app.post(
    "/push-tokens",
    { schema: { tags: ["me"], body: pushTokenBody, response: { 200: okResponse } } },
    async (req) => {
      const b = req.body;
      const user = req.user!;
      // Upsert como dono: o token pode ter pertencido a outro usuário no mesmo aparelho.
      await app.prisma.pushToken.upsert({
        where: { expoToken: b.expoToken },
        create: { userId: user.id, expoToken: b.expoToken, platform: b.platform, deviceName: b.deviceName ?? null },
        update: { userId: user.id, platform: b.platform, deviceName: b.deviceName ?? null, lastSeenAt: app.clock() },
      });
      return { ok: true as const };
    },
  );

  app.delete(
    "/push-tokens",
    {
      schema: {
        tags: ["me"],
        querystring: z.object({ token: z.string().min(10).max(200) }),
        response: { 200: okResponse },
      },
    },
    async (req) => {
      const user = req.user!;
      await app.prisma.pushToken.deleteMany({ where: { expoToken: req.query.token, userId: user.id } });
      return { ok: true as const };
    },
  );
};

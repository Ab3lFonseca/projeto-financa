import { Prisma } from "@app/database";
import {
  changePasswordBody,
  deleteAccountBody,
  errorResponse,
  meDTO,
  notificationPrefs,
  okResponse,
  pushTokenBody,
  updateProfileBody,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { audit } from "../../lib/audit";
import { runAs, runMutation } from "../../lib/db";
import { AppError, Errors } from "../../lib/errors";
import { revokeAllConnections } from "../open-finance/service";
import { eraseAccount } from "../privacy/service";
import { buildMe } from "./service";

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  const { config } = app;

  app.get("/", { schema: { tags: ["me"], response: { 200: meDTO } } }, async (req) =>
    runAs(req, (tx, user) => buildMe(tx, user, config)),
  );

  app.patch(
    "/",
    { schema: { tags: ["me"], body: updateProfileBody, response: { 200: meDTO } } },
    async (req) => {
      const body = req.body;
      const me = await runMutation(req, async (tx, user) => {
        const current = await tx.profile.findUnique({ where: { userId: user.id } });
        if (!current) throw Errors.notFound("Perfil");
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
        return user;
      });
      app.users.invalidate(me.id);
      const fresh = await app.users.resolve({
        sub: me.id,
        email: me.email,
        emailVerified: true,
        userMetadata: {},
        expiresAt: 0,
      });
      return runAs(req, (tx) => buildMe(tx, fresh, config));
    },
  );

  // Troca de senha exige a senha atual (reautenticação) e encerra as outras sessões.
  app.post(
    "/change-password",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: { tags: ["me"], body: changePasswordBody, response: { 200: okResponse, 422: errorResponse } },
    },
    async (req) => {
      const user = req.user!;
      let session;
      try {
        session = await app.authProvider.signIn(user.email, req.body.currentPassword);
      } catch (err) {
        if (err instanceof AppError && err.code === "INVALID_CREDENTIALS") {
          throw Errors.unprocessable("Senha atual incorreta", "WRONG_PASSWORD");
        }
        throw err;
      }
      await app.authProvider.updatePassword(session.accessToken, req.body.newPassword);
      await app.authProvider.signOut(session.accessToken, "others").catch(() => undefined);
      await audit(app.prisma, config.IP_HASH_PEPPER, { actorId: user.id, action: "auth.password_changed", ip: req.ip }, req.log);
      return { ok: true as const };
    },
  );

  // Exclusão definitiva da conta e de todos os dados (LGPD). Exige a senha: é irreversível.
  app.delete(
    "/",
    {
      config: { rateLimit: { max: 3, timeWindow: "1 hour" } },
      schema: { tags: ["me"], body: deleteAccountBody, response: { 200: okResponse, 422: errorResponse } },
    },
    async (req) => {
      const user = req.user!;
      try {
        await app.authProvider.signIn(user.email, req.body.password);
      } catch (err) {
        if (err instanceof AppError && err.code === "INVALID_CREDENTIALS") {
          throw Errors.unprocessable("Senha incorreta", "WRONG_PASSWORD");
        }
        throw err;
      }
      await eraseAccount(user.id, {
        prisma: app.prisma,
        authProvider: app.authProvider,
        pepper: config.IP_HASH_PEPPER,
        now: app.clock,
        log: req.log,
        // Conexões bancárias precisam ser encerradas no provedor ANTES de apagar os registros.
        beforeErase: app.openFinance ? (id) => revokeAllConnections(app.openFinance!.deps, id, { strict: true }) : undefined,
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

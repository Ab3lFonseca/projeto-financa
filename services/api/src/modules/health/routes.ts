import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Errors } from "../../lib/errors";

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  // Liveness: o processo está de pé.
  app.get("/health", { schema: { hide: true, response: { 200: z.object({ status: z.literal("ok") }) } } }, async () => ({
    status: "ok" as const,
  }));

  // Readiness: consegue falar com o banco.
  app.get("/ready", { schema: { hide: true } }, async () => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      return { status: "ready" };
    } catch (err) {
      app.log.error({ err }, "banco indisponível no readiness check");
      throw Errors.unavailable("Banco de dados indisponível", "DB_UNAVAILABLE");
    }
  });
};

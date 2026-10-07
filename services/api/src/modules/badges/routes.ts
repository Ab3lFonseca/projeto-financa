import { badgesResponse, markBadgesSeenBody, okResponse } from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { runAs } from "../../lib/db";
import { evaluateBadges, markBadgesSeen } from "./service";

/**
 * Insígnias da pessoa. Ler já avalia (calcula os números e grava os níveis novos), então basta o app perguntar ao abrir e depois de salvar algo
 * para saber se há conquista nova. Não exige assinatura paga: marcar como vista não é "editar dados".
 */
export const badgeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } }, schema: { tags: ["badges"], response: { 200: badgesResponse } } },
    async (req) => runAs(req, (tx, user) => evaluateBadges(tx, app.prisma, user, app.clock())),
  );

  app.post(
    "/seen",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } }, schema: { tags: ["badges"], body: markBadgesSeenBody, response: { 200: okResponse } } },
    async (req) => {
      await markBadgesSeen(app.prisma, req.user!.id, req.body.ids, app.clock());
      return { ok: true as const };
    },
  );
};

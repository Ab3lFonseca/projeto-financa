import { dashboardDTO } from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { runMutation } from "../../lib/db";
import { buildDashboard } from "./service";

export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  // Tudo que a tela inicial precisa em uma chamada: saldo, mês, categorias, evolução,
  // contas, cartões, orçamentos, metas, próximas contas e insights.
  // (runMutation: antes de somar, gera as recorrências vencidas do usuário.)
  app.get("/", { schema: { tags: ["dashboard"], response: { 200: dashboardDTO } } }, async (req) =>
    runMutation(req, (tx, user, ctx) => buildDashboard(tx, user, app.clock(), { notifier: app.notifier }, ctx)),
  );
};

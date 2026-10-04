import {
  balanceEvolutionDTO,
  cashFlowDTO,
  categoryBreakdownDTO,
  categoryBreakdownQuery,
  FREE_REPORT_RANGES,
  incomeVsExpenseDTO,
  monthComparisonDTO,
  monthComparisonQuery,
  reportQuery,
  resolveRange,
  seriesQuery,
  startOfMonth,
  todayIn,
  type ResolvedRange,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { runAs } from "../../lib/db";
import { Errors } from "../../lib/errors";
import { limitsFor } from "../../lib/plan";
import type { AuthUser } from "../../types";
import { balanceEvolution, cashFlow, categoryBreakdown, incomeVsExpense, monthComparison, pickBucket } from "./service";

/** Converte o período escolhido no app em datas, aplicando o recorte do plano gratuito. */
function resolve(
  user: AuthUser,
  now: Date,
  q: { range: ResolvedRange["range"]; from?: string; to?: string },
): ResolvedRange {
  const advanced = limitsFor(user.plan).advancedReports;
  if (!advanced && !(FREE_REPORT_RANGES as readonly string[]).includes(q.range)) {
    throw Errors.planLimit("Este período está disponível no plano Premium.", { feature: "advancedReports", range: q.range });
  }
  try {
    return resolveRange(q.range, todayIn(user.timezone, now), { from: q.from, to: q.to });
  } catch (err) {
    throw Errors.unprocessable(err instanceof Error ? err.message : "Período inválido", "INVALID_RANGE");
  }
}

export const reportRoutes: FastifyPluginAsyncZod = async (app) => {
  // Despesas (ou receitas) por categoria — gráfico de rosca/pizza.
  app.get(
    "/category-breakdown",
    { schema: { tags: ["reports"], querystring: categoryBreakdownQuery, response: { 200: categoryBreakdownDTO } } },
    async (req) =>
      runAs(req, (tx, user) => categoryBreakdown(tx, user.id, resolve(user, app.clock(), req.query), req.query.type)),
  );

  // Receitas × despesas por semana ou mês — também serve para "gastos por mês/semana".
  app.get(
    "/income-vs-expense",
    { schema: { tags: ["reports"], querystring: seriesQuery, response: { 200: incomeVsExpenseDTO } } },
    async (req) =>
      runAs(req, (tx, user) => {
        const range = resolve(user, app.clock(), req.query);
        return incomeVsExpense(tx, user.id, range, pickBucket(range, req.query.granularity));
      }),
  );

  // Evolução do saldo consolidado (contas que entram no total).
  app.get(
    "/balance-evolution",
    { schema: { tags: ["reports"], querystring: reportQuery, response: { 200: balanceEvolutionDTO } } },
    async (req) =>
      runAs(req, (tx, user) =>
        balanceEvolution(tx, user.id, resolve(user, app.clock(), req.query), todayIn(user.timezone, app.clock())),
      ),
  );

  // Fluxo de caixa (regime de caixa): entradas, saídas e acumulado.
  app.get(
    "/cash-flow",
    { schema: { tags: ["reports"], querystring: seriesQuery, response: { 200: cashFlowDTO } } },
    async (req) =>
      runAs(req, (tx, user) => {
        const range = resolve(user, app.clock(), req.query);
        return cashFlow(tx, user.id, range, pickBucket(range, req.query.granularity));
      }),
  );

  // Mês × mês anterior (até o mesmo dia, quando é o mês corrente), com variação por categoria.
  app.get(
    "/month-comparison",
    { schema: { tags: ["reports"], querystring: monthComparisonQuery, response: { 200: monthComparisonDTO } } },
    async (req) =>
      runAs(req, (tx, user) => {
        const today = todayIn(user.timezone, app.clock());
        return monthComparison(tx, user.id, req.query.month ?? startOfMonth(today), today);
      }),
  );
};

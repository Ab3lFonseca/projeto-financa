import {
  budgetDTO,
  budgetsResponse,
  copyBudgetsBody,
  copyBudgetsResponse,
  fromISODate,
  idParam,
  listBudgetsQuery,
  okResponse,
  startOfMonth,
  todayIn,
  updateBudgetBody,
  upsertBudgetBody,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { runAs, runMutation } from "../../lib/db";
import { Errors } from "../../lib/errors";
import { requireCategory } from "../../lib/refs";
import { budgetDTOById, budgetsForMonth } from "./service";

export const budgetRoutes: FastifyPluginAsyncZod = async (app) => {
  // Orçamentos do mês (padrão: mês atual) com quanto já foi gasto e o status de cada um.
  app.get(
    "/",
    { schema: { tags: ["budgets"], querystring: listBudgetsQuery, response: { 200: budgetsResponse } } },
    async (req) =>
      runAs(req, (tx, user) => {
        const month = req.query.month ?? startOfMonth(todayIn(user.timezone, app.clock()));
        return budgetsForMonth(tx, user.id, month);
      }),
  );

  // Cria ou atualiza o orçamento de (categoria, mês).
  app.post(
    "/",
    { schema: { tags: ["budgets"], body: upsertBudgetBody, response: { 200: budgetDTO, 201: budgetDTO } } },
    async (req, reply) => {
      const b = req.body;
      const { dto, created } = await runMutation(req, async (tx, user) => {
        await requireCategory(tx, user.id, b.categoryId, "EXPENSE");
        const month = fromISODate(b.month);
        const existing = await tx.budget.findUnique({
          where: { userId_categoryId_month: { userId: user.id, categoryId: b.categoryId, month } },
          select: { id: true },
        });
        const row = existing
          ? await tx.budget.update({ where: { id: existing.id }, data: { amountCents: b.amountCents, alertPct: b.alertPct } })
          : await tx.budget.create({
              data: { userId: user.id, categoryId: b.categoryId, month, amountCents: b.amountCents, alertPct: b.alertPct },
            });
        return { dto: (await budgetDTOById(tx, user.id, row.id))!, created: !existing };
      });
      return reply.code(created ? 201 : 200).send(dto);
    },
  );

  app.put(
    "/:id",
    { schema: { tags: ["budgets"], params: idParam, body: updateBudgetBody, response: { 200: budgetDTO } } },
    async (req) =>
      runMutation(req, async (tx, user) => {
        const current = await tx.budget.findFirst({ where: { id: req.params.id, userId: user.id } });
        if (!current) throw Errors.notFound("Orçamento");
        await tx.budget.update({
          where: { id: current.id },
          data: {
            ...(req.body.amountCents !== undefined ? { amountCents: req.body.amountCents } : {}),
            ...(req.body.alertPct !== undefined ? { alertPct: req.body.alertPct } : {}),
          },
        });
        return (await budgetDTOById(tx, user.id, current.id))!;
      }),
  );

  app.delete(
    "/:id",
    { schema: { tags: ["budgets"], params: idParam, response: { 200: okResponse } } },
    async (req) => {
      await runMutation(req, async (tx, user) => {
        const result = await tx.budget.deleteMany({ where: { id: req.params.id, userId: user.id } });
        if (result.count === 0) throw Errors.notFound("Orçamento");
      });
      return { ok: true as const };
    },
  );

  // "Copiar do mês anterior": cria no mês de destino os orçamentos que ainda não existem.
  app.post(
    "/copy",
    { schema: { tags: ["budgets"], body: copyBudgetsBody, response: { 200: copyBudgetsResponse } } },
    async (req) => {
      const { fromMonth, toMonth, overwrite } = req.body;
      if (fromMonth === toMonth) throw Errors.unprocessable("Escolha meses diferentes", "SAME_MONTH");
      return runMutation(req, async (tx, user) => {
        const source = await tx.budget.findMany({
          where: { userId: user.id, month: fromISODate(fromMonth), category: { deletedAt: null } },
        });
        const target = await tx.budget.findMany({
          where: { userId: user.id, month: fromISODate(toMonth) },
          select: { id: true, categoryId: true },
        });
        const existing = new Map(target.map((t) => [t.categoryId, t.id]));
        let created = 0;
        let skipped = 0;
        for (const s of source) {
          const existingId = existing.get(s.categoryId);
          if (existingId && !overwrite) {
            skipped++;
            continue;
          }
          if (existingId) {
            await tx.budget.update({ where: { id: existingId }, data: { amountCents: s.amountCents, alertPct: s.alertPct } });
          } else {
            await tx.budget.create({
              data: {
                userId: user.id,
                categoryId: s.categoryId,
                month: fromISODate(toMonth),
                amountCents: s.amountCents,
                alertPct: s.alertPct,
              },
            });
          }
          created++;
        }
        return { created, skipped };
      });
    },
  );
};

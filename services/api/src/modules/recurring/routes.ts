import {
  addDays,
  createRecurringBody,
  fromISODate,
  idParam,
  nextOccurrence,
  occurrencesBetween,
  okResponse,
  parseISODate,
  recurringRuleDTO,
  todayIn,
  updateRecurringBody,
  upcomingOccurrenceDTO,
  upcomingQuery,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { runAs, runMutation } from "../../lib/db";
import { Errors } from "../../lib/errors";
import { assertCanCreate } from "../../lib/plan";
import { requireAccount, requireCard, requireCategory } from "../../lib/refs";
import { catchUpUser, generateForRule, ruleInclude, ruleShape, toRuleDTO } from "./service";

const dueInclude = {
  account: { select: { archivedAt: true, deletedAt: true } },
  card: { select: { id: true, closingDay: true, dueDay: true, archivedAt: true, deletedAt: true } },
} as const;

export const recurringRoutes: FastifyPluginAsyncZod = async (app) => {
  const deps = () => ({ notifier: app.notifier });

  app.get(
    "/",
    { schema: { tags: ["recurring"], response: { 200: z.object({ data: z.array(recurringRuleDTO) }) } } },
    async (req) =>
      runMutation(req, async (tx, user, ctx) => {
        // Atualiza o que estiver atrasado antes de listar (o usuário sempre vê o estado em dia).
        await catchUpUser(tx, user, app.clock(), deps(), ctx);
        const rows = await tx.recurringRule.findMany({
          where: { userId: user.id, deletedAt: null },
          include: ruleInclude,
          orderBy: [{ active: "desc" }, { nextRunOn: "asc" }],
        });
        return { data: rows.map(toRuleDTO) };
      }),
  );

  app.post(
    "/",
    { schema: { tags: ["recurring"], body: createRecurringBody, response: { 201: recurringRuleDTO } } },
    async (req, reply) => {
      const b = req.body;
      const dto = await runMutation(req, async (tx, user, ctx) => {
        await assertCanCreate(tx, user, "recurringRules");
        if (b.accountId) await requireAccount(tx, user.id, b.accountId);
        if (b.cardId) await requireCard(tx, user.id, b.cardId);
        if (b.categoryId) await requireCategory(tx, user.id, b.categoryId, b.type);

        const dayOfMonth = b.frequency === "WEEKLY" ? null : (b.dayOfMonth ?? parseISODate(b.startDate).day);
        const created = await tx.recurringRule.create({
          data: {
            userId: user.id,
            type: b.type,
            description: b.description,
            amountCents: b.amountCents,
            accountId: b.accountId ?? null,
            cardId: b.cardId ?? null,
            categoryId: b.categoryId ?? null,
            paymentMethod: b.cardId ? "CREDIT" : (b.paymentMethod ?? "OTHER"),
            frequency: b.frequency,
            intervalCount: b.intervalCount,
            dayOfMonth,
            startDate: fromISODate(b.startDate),
            endDate: b.endDate ? fromISODate(b.endDate) : null,
            nextRunOn: fromISODate(b.startDate),
            notes: b.notes ?? null,
          },
        });
        // Se começa no passado (ou hoje), já gera o que está devido.
        const today = todayIn(user.timezone, app.clock());
        const due = await tx.recurringRule.findUniqueOrThrow({ where: { id: created.id }, include: dueInclude });
        await generateForRule(tx, user, due, today, deps(), ctx);
        return toRuleDTO(await tx.recurringRule.findUniqueOrThrow({ where: { id: created.id }, include: ruleInclude }));
      });
      return reply.code(201).send(dto);
    },
  );

  // Próximas ocorrências projetadas (não gravadas): "contas a vencer" nos próximos N dias.
  app.get(
    "/upcoming",
    { schema: { tags: ["recurring"], querystring: upcomingQuery, response: { 200: z.object({ data: z.array(upcomingOccurrenceDTO) }) } } },
    async (req) =>
      runMutation(req, async (tx, user, ctx) => {
        await catchUpUser(tx, user, app.clock(), deps(), ctx);
        const today = todayIn(user.timezone, app.clock());
        const until = addDays(today, req.query.days);
        const rules = await tx.recurringRule.findMany({
          where: { userId: user.id, active: true, deletedAt: null },
          include: ruleInclude,
        });
        const items = rules.flatMap((r) =>
          occurrencesBetween(ruleShape(r), r.nextRunOn.toISOString().slice(0, 10), until, 60)
            .filter((d) => d > today)
            .map((date) => ({
              ruleId: r.id,
              date,
              type: r.type as "INCOME" | "EXPENSE",
              description: r.description,
              amountCents: Number(r.amountCents),
              category: r.category
                ? { id: r.category.id, name: r.category.name, icon: r.category.icon, color: r.category.color, type: r.category.type, deleted: r.category.deletedAt !== null }
                : null,
            })),
        );
        items.sort((a, b) => a.date.localeCompare(b.date));
        return { data: items };
      }),
  );

  app.get(
    "/:id",
    { schema: { tags: ["recurring"], params: idParam, response: { 200: recurringRuleDTO } } },
    async (req) =>
      runAs(req, async (tx, user) => {
        const row = await tx.recurringRule.findFirst({ where: { id: req.params.id, userId: user.id, deletedAt: null }, include: ruleInclude });
        if (!row) throw Errors.notFound("Recorrência");
        return toRuleDTO(row);
      }),
  );

  // Alterações valem para as próximas ocorrências; o que já foi gerado não é reescrito.
  app.put(
    "/:id",
    { schema: { tags: ["recurring"], params: idParam, body: updateRecurringBody, response: { 200: recurringRuleDTO } } },
    async (req) => {
      const b = req.body;
      return runMutation(req, async (tx, user, ctx) => {
        const current = await tx.recurringRule.findFirst({ where: { id: req.params.id, userId: user.id, deletedAt: null } });
        if (!current) throw Errors.notFound("Recorrência");
        if (b.categoryId) await requireCategory(tx, user.id, b.categoryId, current.type as "INCOME" | "EXPENSE");
        if (b.paymentMethod) {
          if (current.cardId && b.paymentMethod !== "CREDIT") {
            throw Errors.unprocessable("Cartão usa a forma de pagamento Crédito", "PAYMENT_METHOD_MISMATCH", { field: "paymentMethod" });
          }
          if (current.accountId && b.paymentMethod === "CREDIT") {
            throw Errors.unprocessable("Crédito exige um cartão", "PAYMENT_METHOD_MISMATCH", { field: "paymentMethod" });
          }
        }
        if (b.endDate && b.endDate < current.startDate.toISOString().slice(0, 10)) {
          throw Errors.unprocessable("O fim deve ser depois do início", "INVALID_PERIOD", { field: "endDate" });
        }
        if (b.active === true && !current.active) await assertCanCreate(tx, user, "recurringRules");

        let nextRunOn = current.nextRunOn;
        let active = b.active ?? current.active;
        // Reativar uma regra que já passou do fim, sem novo fim, retoma da próxima ocorrência.
        if (b.active === true && !current.active) {
          const today = todayIn(user.timezone, app.clock());
          const shape = ruleShape({ ...current, endDate: b.endDate !== undefined ? (b.endDate ? fromISODate(b.endDate) : null) : current.endDate });
          let cursor = current.nextRunOn.toISOString().slice(0, 10);
          // pula ocorrências antigas: reativar não "recupera" o período em que esteve pausada
          let guard = 0;
          while (cursor < today && guard++ < 1000) {
            const n = nextOccurrence(shape, cursor);
            if (!n) break;
            cursor = n;
          }
          nextRunOn = fromISODate(cursor);
          if (shape.endDate && cursor > shape.endDate) active = false;
        }

        await tx.recurringRule.update({
          where: { id: current.id },
          data: {
            ...(b.description !== undefined ? { description: b.description } : {}),
            ...(b.amountCents !== undefined ? { amountCents: b.amountCents } : {}),
            ...(b.categoryId !== undefined ? { categoryId: b.categoryId } : {}),
            ...(b.paymentMethod !== undefined ? { paymentMethod: b.paymentMethod } : {}),
            ...(b.endDate !== undefined ? { endDate: b.endDate ? fromISODate(b.endDate) : null } : {}),
            ...(b.notes !== undefined ? { notes: b.notes } : {}),
            active,
            nextRunOn,
          },
        });
        const due = await tx.recurringRule.findUniqueOrThrow({ where: { id: current.id }, include: dueInclude });
        await generateForRule(tx, user, due, todayIn(user.timezone, app.clock()), deps(), ctx);
        return toRuleDTO(await tx.recurringRule.findUniqueOrThrow({ where: { id: current.id }, include: ruleInclude }));
      });
    },
  );

  app.delete(
    "/:id",
    { schema: { tags: ["recurring"], params: idParam, response: { 200: okResponse } } },
    async (req) => {
      await runMutation(req, async (tx, user) => {
        const result = await tx.recurringRule.updateMany({
          where: { id: req.params.id, userId: user.id, deletedAt: null },
          data: { deletedAt: app.clock(), active: false },
        });
        if (result.count === 0) throw Errors.notFound("Recorrência");
      });
      return { ok: true as const };
    },
  );
};

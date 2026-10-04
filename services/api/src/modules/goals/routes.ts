import {
  addContributionBody,
  createGoalBody,
  fromISODate,
  goalContributionDTO,
  goalDetailDTO,
  goalDTO,
  idParam,
  listContributionsQuery,
  listGoalsQuery,
  listOf,
  okResponse,
  todayIn,
  updateGoalBody,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { runAs, runMutation } from "../../lib/db";
import { dateOut, num, tsOut } from "../../lib/dto";
import { Errors } from "../../lib/errors";
import { decodeCursor, encodeCursor, slicePage } from "../../lib/pagination";
import { assertCanCreate } from "../../lib/plan";
import { contributionSums, listGoalDTOs, syncGoalProgress } from "./service";

const contributionParams = z.object({ id: z.uuid(), contributionId: z.uuid() });
const cursorShape = z.object({ d: z.string(), id: z.uuid() });

type ContributionRow = { id: string; amountCents: bigint; occurredOn: Date; notes: string | null; createdAt: Date };
const toContributionDTO = (c: ContributionRow) => ({
  id: c.id,
  amountCents: num(c.amountCents),
  occurredOn: dateOut(c.occurredOn),
  notes: c.notes,
  createdAt: tsOut(c.createdAt),
});

export const goalRoutes: FastifyPluginAsyncZod = async (app) => {
  const deps = () => ({ notifier: app.notifier });

  app.get(
    "/",
    { schema: { tags: ["goals"], querystring: listGoalsQuery, response: { 200: z.object({ data: z.array(goalDTO) }) } } },
    async (req) =>
      runAs(req, async (tx, user) => ({
        data: await listGoalDTOs(tx, user.id, todayIn(user.timezone, app.clock()), { status: req.query.status }),
      })),
  );

  app.post(
    "/",
    { schema: { tags: ["goals"], body: createGoalBody, response: { 201: goalDTO } } },
    async (req, reply) => {
      const b = req.body;
      const dto = await runMutation(req, async (tx, user, ctx) => {
        await assertCanCreate(tx, user, "goals");
        const today = todayIn(user.timezone, app.clock());
        if (b.deadline && b.deadline <= today) {
          throw Errors.unprocessable("O prazo deve ser uma data futura", "DEADLINE_IN_PAST", { field: "deadline" });
        }
        const created = await tx.goal.create({
          data: {
            userId: user.id,
            name: b.name,
            kind: b.kind,
            targetCents: b.targetCents,
            initialCents: b.initialCents,
            deadline: b.deadline ? fromISODate(b.deadline) : null,
            icon: b.icon ?? null,
            color: b.color ?? null,
          },
        });
        await syncGoalProgress(tx, user, created.id, 0, app.clock(), deps(), ctx);
        const [goal] = await listGoalDTOs(tx, user.id, today, { ids: [created.id], includeArchived: true });
        return goal!;
      });
      return reply.code(201).send(dto);
    },
  );

  app.get(
    "/:id",
    { schema: { tags: ["goals"], params: idParam, response: { 200: goalDetailDTO } } },
    async (req) =>
      runAs(req, async (tx, user) => {
        const today = todayIn(user.timezone, app.clock());
        const [goal] = await listGoalDTOs(tx, user.id, today, { ids: [req.params.id], includeArchived: true });
        if (!goal) throw Errors.notFound("Meta");
        const contributions = await tx.goalContribution.findMany({
          where: { userId: user.id, goalId: goal.id },
          orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
          take: 20,
        });
        return { ...goal, contributions: contributions.map(toContributionDTO) };
      }),
  );

  app.put(
    "/:id",
    { schema: { tags: ["goals"], params: idParam, body: updateGoalBody, response: { 200: goalDTO } } },
    async (req) => {
      const b = req.body;
      return runMutation(req, async (tx, user, ctx) => {
        const current = await tx.goal.findFirst({ where: { id: req.params.id, userId: user.id, deletedAt: null } });
        if (!current) throw Errors.notFound("Meta");
        const today = todayIn(user.timezone, app.clock());
        const before = await contributionSums(tx, user.id, [current.id]);
        const previousPct = Math.min(100, ((num(current.initialCents) + (before.get(current.id) ?? 0)) / num(current.targetCents)) * 100);

        if (b.status === "ACTIVE" && current.status === "ARCHIVED") await assertCanCreate(tx, user, "goals");
        await tx.goal.update({
          where: { id: current.id },
          data: {
            ...(b.name !== undefined ? { name: b.name } : {}),
            ...(b.kind !== undefined ? { kind: b.kind } : {}),
            ...(b.targetCents !== undefined ? { targetCents: b.targetCents } : {}),
            ...(b.deadline !== undefined ? { deadline: b.deadline ? fromISODate(b.deadline) : null } : {}),
            ...(b.icon !== undefined ? { icon: b.icon } : {}),
            ...(b.color !== undefined ? { color: b.color } : {}),
            ...(b.status !== undefined ? { status: b.status === "ARCHIVED" ? "ARCHIVED" : current.achievedAt ? "ACHIEVED" : "ACTIVE" } : {}),
          },
        });
        if (b.targetCents !== undefined) await syncGoalProgress(tx, user, current.id, previousPct, app.clock(), deps(), ctx);
        const [goal] = await listGoalDTOs(tx, user.id, today, { ids: [current.id], includeArchived: true });
        return goal!;
      });
    },
  );

  app.delete(
    "/:id",
    { schema: { tags: ["goals"], params: idParam, response: { 200: okResponse } } },
    async (req) => {
      await runMutation(req, async (tx, user) => {
        const result = await tx.goal.updateMany({
          where: { id: req.params.id, userId: user.id, deletedAt: null },
          data: { deletedAt: app.clock() },
        });
        if (result.count === 0) throw Errors.notFound("Meta");
      });
      return { ok: true as const };
    },
  );

  // ---- Aportes e resgates

  app.get(
    "/:id/contributions",
    { schema: { tags: ["goals"], params: idParam, querystring: listContributionsQuery, response: { 200: listOf(goalContributionDTO) } } },
    async (req) =>
      runAs(req, async (tx, user) => {
        const goal = await tx.goal.findFirst({ where: { id: req.params.id, userId: user.id, deletedAt: null }, select: { id: true } });
        if (!goal) throw Errors.notFound("Meta");
        const { limit, cursor } = req.query;
        const c = cursor ? decodeCursor(cursor, cursorShape) : null;
        const rows = await tx.goalContribution.findMany({
          where: {
            userId: user.id,
            goalId: goal.id,
            ...(c ? { OR: [{ occurredOn: { lt: fromISODate(c.d) } }, { occurredOn: fromISODate(c.d), id: { lt: c.id } }] } : {}),
          },
          orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
          take: limit + 1,
        });
        const { items, hasMore } = slicePage(rows, limit);
        const last = items[items.length - 1];
        return {
          data: items.map(toContributionDTO),
          page: { hasMore, nextCursor: hasMore && last ? encodeCursor({ d: dateOut(last.occurredOn), id: last.id }) : null },
        };
      }),
  );

  app.post(
    "/:id/contributions",
    { schema: { tags: ["goals"], params: idParam, body: addContributionBody, response: { 201: goalDTO } } },
    async (req, reply) => {
      const b = req.body;
      const dto = await runMutation(req, async (tx, user, ctx) => {
        const goal = await tx.goal.findFirst({ where: { id: req.params.id, userId: user.id, deletedAt: null } });
        if (!goal) throw Errors.notFound("Meta");
        if (goal.status === "ARCHIVED") throw Errors.conflict("Esta meta está arquivada", "GOAL_ARCHIVED");
        const today = todayIn(user.timezone, app.clock());

        const sums = await contributionSums(tx, user.id, [goal.id]);
        const current = num(goal.initialCents) + (sums.get(goal.id) ?? 0);
        if (b.amountCents < 0 && current + b.amountCents < 0) {
          throw Errors.unprocessable("O resgate é maior que o valor guardado", "WITHDRAWAL_TOO_LARGE", { currentCents: current });
        }
        const previousPct = (current / num(goal.targetCents)) * 100;

        await tx.goalContribution.create({
          data: {
            userId: user.id,
            goalId: goal.id,
            amountCents: b.amountCents,
            occurredOn: fromISODate(b.occurredOn ?? today),
            notes: b.notes ?? null,
          },
        });
        await syncGoalProgress(tx, user, goal.id, previousPct, app.clock(), deps(), ctx);
        const [updated] = await listGoalDTOs(tx, user.id, today, { ids: [goal.id], includeArchived: true });
        return updated!;
      });
      return reply.code(201).send(dto);
    },
  );

  app.delete(
    "/:id/contributions/:contributionId",
    { schema: { tags: ["goals"], params: contributionParams, response: { 200: goalDTO } } },
    async (req) =>
      runMutation(req, async (tx, user, ctx) => {
        const contribution = await tx.goalContribution.findFirst({
          where: { id: req.params.contributionId, goalId: req.params.id, userId: user.id },
        });
        if (!contribution) throw Errors.notFound("Aporte");
        const goal = await tx.goal.findFirst({ where: { id: req.params.id, userId: user.id, deletedAt: null } });
        if (!goal) throw Errors.notFound("Meta");
        const sums = await contributionSums(tx, user.id, [goal.id]);
        const previousPct = ((num(goal.initialCents) + (sums.get(goal.id) ?? 0)) / num(goal.targetCents)) * 100;
        await tx.goalContribution.delete({ where: { id: contribution.id } });
        await syncGoalProgress(tx, user, goal.id, previousPct, app.clock(), deps(), ctx);
        const [updated] = await listGoalDTOs(tx, user.id, todayIn(user.timezone, app.clock()), { ids: [goal.id], includeArchived: true });
        return updated!;
      }),
  );
};

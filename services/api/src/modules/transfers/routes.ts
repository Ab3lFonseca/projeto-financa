import {
  createTransferBody,
  fromISODate,
  idParam,
  okResponse,
  transferDTO,
  updateTransferBody,
  type TransferDTO,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { randomUUID } from "node:crypto";
import { runAs, runMutation, type Tx } from "../../lib/db";
import { dateOut, num, tsOut } from "../../lib/dto";
import { Errors } from "../../lib/errors";
import { requireAccount } from "../../lib/refs";

const accountSelect = { select: { id: true, name: true, deletedAt: true } } as const;
const include = { fromAccount: accountSelect, toAccount: accountSelect } as const;

const ref = (a: { id: string; name: string; deletedAt: Date | null }) => ({ id: a.id, name: a.name, deleted: a.deletedAt !== null });

type TransferRow = NonNullable<Awaited<ReturnType<typeof load>>>;

function load(tx: Tx, userId: string, id: string) {
  return tx.transfer.findFirst({ where: { id, userId, deletedAt: null }, include });
}

function toDTO(t: TransferRow): TransferDTO {
  return {
    id: t.id,
    from: ref(t.fromAccount),
    to: ref(t.toAccount),
    amountCents: num(t.amountCents),
    occurredOn: dateOut(t.occurredOn),
    notes: t.notes,
    createdAt: tsOut(t.createdAt),
  };
}

/** As pernas (OUT e IN) são lançamentos do tipo TRANSFER: afetam saldo, não receitas/despesas. */
function legs(args: {
  userId: string;
  transferId: string;
  from: { id: string; name: string };
  to: { id: string; name: string };
  amountCents: number;
  occurredOn: string;
}) {
  const base = {
    userId: args.userId,
    type: "TRANSFER" as const,
    status: "POSTED" as const,
    amountCents: args.amountCents,
    occurredOn: fromISODate(args.occurredOn),
    paymentMethod: "OTHER" as const,
    transferId: args.transferId,
  };
  return {
    out: { ...base, description: `Transferência para ${args.to.name}`, accountId: args.from.id, transferSide: "OUT" as const },
    in: { ...base, description: `Transferência de ${args.from.name}`, accountId: args.to.id, transferSide: "IN" as const },
  };
}

export const transferRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/",
    { schema: { tags: ["transfers"], body: createTransferBody, response: { 200: transferDTO, 201: transferDTO } } },
    async (req, reply) => {
      const b = req.body;
      const { dto, replayed } = await runMutation(req, async (tx, user) => {
        if (b.id) {
          const existing = await load(tx, user.id, b.id);
          if (existing) return { dto: toDTO(existing), replayed: true };
        }
        const from = await requireAccount(tx, user.id, b.fromAccountId, { field: "fromAccountId" });
        const to = await requireAccount(tx, user.id, b.toAccountId, { field: "toAccountId" });
        const id = b.id ?? randomUUID();
        await tx.transfer.create({
          data: {
            id,
            userId: user.id,
            fromAccountId: from.id,
            toAccountId: to.id,
            amountCents: b.amountCents,
            occurredOn: fromISODate(b.occurredOn),
            notes: b.notes ?? null,
          },
        });
        const l = legs({ userId: user.id, transferId: id, from, to, amountCents: b.amountCents, occurredOn: b.occurredOn });
        await tx.transaction.createMany({ data: [l.out, l.in] });
        return { dto: toDTO((await load(tx, user.id, id))!), replayed: false };
      });
      return reply.code(replayed ? 200 : 201).send(dto);
    },
  );

  app.get(
    "/:id",
    { schema: { tags: ["transfers"], params: idParam, response: { 200: transferDTO } } },
    async (req) =>
      runAs(req, async (tx, user) => {
        const row = await load(tx, user.id, req.params.id);
        if (!row) throw Errors.notFound("Transferência");
        return toDTO(row);
      }),
  );

  app.put(
    "/:id",
    { schema: { tags: ["transfers"], params: idParam, body: updateTransferBody, response: { 200: transferDTO } } },
    async (req) => {
      const b = req.body;
      return runMutation(req, async (tx, user) => {
        const current = await load(tx, user.id, req.params.id);
        if (!current) throw Errors.notFound("Transferência");

        const fromId = b.fromAccountId ?? current.fromAccountId;
        const toId = b.toAccountId ?? current.toAccountId;
        if (fromId === toId) {
          throw Errors.unprocessable("A conta de origem e a de destino devem ser diferentes", "SAME_ACCOUNT", { field: "toAccountId" });
        }
        const from = await requireAccount(tx, user.id, fromId, { field: "fromAccountId", allowArchived: fromId === current.fromAccountId });
        const to = await requireAccount(tx, user.id, toId, { field: "toAccountId", allowArchived: toId === current.toAccountId });
        const amountCents = b.amountCents ?? num(current.amountCents);
        const occurredOn = b.occurredOn ?? dateOut(current.occurredOn);

        await tx.transfer.update({
          where: { id: current.id },
          data: {
            fromAccountId: from.id,
            toAccountId: to.id,
            amountCents,
            occurredOn: fromISODate(occurredOn),
            notes: b.notes !== undefined ? b.notes : current.notes,
          },
        });
        const l = legs({ userId: user.id, transferId: current.id, from, to, amountCents, occurredOn });
        for (const [side, leg] of [["OUT", l.out], ["IN", l.in]] as const) {
          await tx.transaction.updateMany({
            where: { userId: user.id, transferId: current.id, transferSide: side },
            data: {
              description: leg.description,
              accountId: leg.accountId,
              amountCents: leg.amountCents,
              occurredOn: leg.occurredOn,
              version: { increment: 1 },
            },
          });
        }
        return toDTO((await load(tx, user.id, current.id))!);
      });
    },
  );

  app.delete(
    "/:id",
    { schema: { tags: ["transfers"], params: idParam, response: { 200: okResponse } } },
    async (req) => {
      await runMutation(req, async (tx, user) => {
        const current = await load(tx, user.id, req.params.id);
        if (!current) throw Errors.notFound("Transferência");
        const now = app.clock();
        await tx.transaction.updateMany({
          where: { userId: user.id, transferId: current.id },
          data: { deletedAt: now, version: { increment: 1 } },
        });
        await tx.transfer.update({ where: { id: current.id }, data: { deletedAt: now } });
      });
      return { ok: true as const };
    },
  );
};

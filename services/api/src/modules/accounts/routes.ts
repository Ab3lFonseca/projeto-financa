import {
  accountDetailDTO,
  accountDTO,
  createAccountBody,
  idParam,
  listAccountsQuery,
  okResponse,
  updateAccountBody,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { runAs, runMutation } from "../../lib/db";
import { Errors } from "../../lib/errors";
import { assertCanCreate } from "../../lib/plan";
import { toTransactionDTO, transactionInclude } from "../transactions/service";
import { listAccountDTOs } from "./service";

export const accountRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    { schema: { tags: ["accounts"], querystring: listAccountsQuery, response: { 200: z.object({ data: z.array(accountDTO) }) } } },
    async (req) =>
      runAs(req, async (tx, user) => ({
        data: await listAccountDTOs(tx, user.id, user.timezone, app.clock(), { includeArchived: req.query.includeArchived }),
      })),
  );

  app.post(
    "/",
    { schema: { tags: ["accounts"], body: createAccountBody, response: { 201: accountDTO } } },
    async (req, reply) => {
      const b = req.body;
      const dto = await runMutation(req, async (tx, user) => {
        await assertCanCreate(tx, user, "accounts");
        if (b.bankId) {
          const bank = await tx.bank.findUnique({ where: { id: b.bankId }, select: { id: true } });
          if (!bank) throw Errors.unprocessable("Banco não encontrado", "BANK_NOT_FOUND", { field: "bankId" });
        }
        const clash = await tx.account.findFirst({
          where: { userId: user.id, deletedAt: null, name: { equals: b.name, mode: "insensitive" } },
          select: { id: true },
        });
        if (clash) throw Errors.conflict("Já existe uma conta com este nome", "ACCOUNT_EXISTS");

        const created = await tx.account.create({
          data: {
            userId: user.id,
            name: b.name,
            type: b.type,
            bankId: b.bankId ?? null,
            openingBalanceCents: b.openingBalanceCents,
            color: b.color ?? null,
            icon: b.icon ?? null,
            includeInTotal: b.includeInTotal,
          },
        });
        const [dto] = await listAccountDTOs(tx, user.id, user.timezone, app.clock(), { ids: [created.id], includeArchived: true });
        return dto!;
      });
      return reply.code(201).send(dto);
    },
  );

  // Detalhe da conta com as últimas movimentações.
  app.get(
    "/:id",
    { schema: { tags: ["accounts"], params: idParam, response: { 200: accountDetailDTO } } },
    async (req) =>
      runAs(req, async (tx, user) => {
        const [dto] = await listAccountDTOs(tx, user.id, user.timezone, app.clock(), { ids: [req.params.id], includeArchived: true });
        if (!dto) throw Errors.notFound("Conta");
        const recent = await tx.transaction.findMany({
          where: { userId: user.id, accountId: dto.id, deletedAt: null },
          include: transactionInclude,
          orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
          take: 10,
        });
        return { ...dto, recentTransactions: recent.map(toTransactionDTO) };
      }),
  );

  app.put(
    "/:id",
    { schema: { tags: ["accounts"], params: idParam, body: updateAccountBody, response: { 200: accountDTO } } },
    async (req) => {
      const b = req.body;
      return runMutation(req, async (tx, user) => {
        const current = await tx.account.findFirst({ where: { id: req.params.id, userId: user.id, deletedAt: null } });
        if (!current) throw Errors.notFound("Conta");
        if (b.bankId) {
          const bank = await tx.bank.findUnique({ where: { id: b.bankId }, select: { id: true } });
          if (!bank) throw Errors.unprocessable("Banco não encontrado", "BANK_NOT_FOUND", { field: "bankId" });
        }
        if (b.name !== undefined && b.name.toLowerCase() !== current.name.toLowerCase()) {
          const clash = await tx.account.findFirst({
            where: { userId: user.id, deletedAt: null, id: { not: current.id }, name: { equals: b.name, mode: "insensitive" } },
            select: { id: true },
          });
          if (clash) throw Errors.conflict("Já existe uma conta com este nome", "ACCOUNT_EXISTS");
        }
        // Desarquivar uma conta volta a contar para o limite do plano.
        if (b.archived === false && current.archivedAt) await assertCanCreate(tx, user, "accounts");

        await tx.account.update({
          where: { id: current.id },
          data: {
            ...(b.name !== undefined ? { name: b.name } : {}),
            ...(b.type !== undefined ? { type: b.type } : {}),
            ...(b.bankId !== undefined ? { bankId: b.bankId } : {}),
            ...(b.openingBalanceCents !== undefined ? { openingBalanceCents: b.openingBalanceCents } : {}),
            ...(b.color !== undefined ? { color: b.color } : {}),
            ...(b.icon !== undefined ? { icon: b.icon } : {}),
            ...(b.includeInTotal !== undefined ? { includeInTotal: b.includeInTotal } : {}),
            ...(b.archived !== undefined ? { archivedAt: b.archived ? (current.archivedAt ?? app.clock()) : null } : {}),
          },
        });
        const [dto] = await listAccountDTOs(tx, user.id, user.timezone, app.clock(), { ids: [current.id], includeArchived: true });
        return dto!;
      });
    },
  );

  // Só exclui contas sem movimentação. Com histórico, o caminho é arquivar (preserva relatórios).
  app.delete(
    "/:id",
    { schema: { tags: ["accounts"], params: idParam, response: { 200: okResponse } } },
    async (req) => {
      await runMutation(req, async (tx, user) => {
        const account = await tx.account.findFirst({ where: { id: req.params.id, userId: user.id, deletedAt: null } });
        if (!account) throw Errors.notFound("Conta");
        const txCount = await tx.transaction.count({ where: { userId: user.id, accountId: account.id, deletedAt: null } });
        const paymentCount = await tx.invoicePayment.count({ where: { userId: user.id, accountId: account.id } });
        const cardCount = await tx.creditCard.count({ where: { userId: user.id, payAccountId: account.id, deletedAt: null } });
        if (txCount > 0 || paymentCount > 0) {
          throw Errors.conflict(
            "Esta conta tem movimentações. Arquive-a para preservar o histórico.",
            "ACCOUNT_HAS_TRANSACTIONS",
          );
        }
        if (cardCount > 0) {
          throw Errors.conflict("Esta conta é usada para pagar cartões. Troque a conta dos cartões antes.", "ACCOUNT_IN_USE");
        }
        await tx.recurringRule.updateMany({
          where: { userId: user.id, accountId: account.id, deletedAt: null },
          data: { deletedAt: app.clock(), active: false },
        });
        await tx.account.update({ where: { id: account.id }, data: { deletedAt: app.clock() } });
      });
      return { ok: true as const };
    },
  );
};

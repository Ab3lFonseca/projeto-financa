import {
  createTransactionBody,
  deleteTransactionQuery,
  idParam,
  listOf,
  listTransactionsQuery,
  okResponse,
  transactionDTO,
  transactionSummaryDTO,
  transactionSummaryQuery,
  updateTransactionBody,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { runAs, runMutation } from "../../lib/db";
import { Errors } from "../../lib/errors";
import {
  createTransactions,
  deleteTransaction,
  listTransactions,
  summarizeTransactions,
  toTransactionDTO,
  transactionInclude,
  updateTransaction,
} from "./service";

export const transactionRoutes: FastifyPluginAsyncZod = async (app) => {
  const deps = () => ({ notifier: app.notifier, now: app.clock() });

  // Lista com filtros, ordenação e paginação por cursor.
  app.get(
    "/",
    { schema: { tags: ["transactions"], querystring: listTransactionsQuery, response: { 200: listOf(transactionDTO) } } },
    async (req) => runAs(req, (tx, user) => listTransactions(tx, user.id, req.query)),
  );

  // Totais para os mesmos filtros (receitas, despesas, saldo do período).
  app.get(
    "/summary",
    { schema: { tags: ["transactions"], querystring: transactionSummaryQuery, response: { 200: transactionSummaryDTO } } },
    async (req) => runAs(req, (tx, user) => summarizeTransactions(tx, user.id, req.query)),
  );

  app.get(
    "/:id",
    { schema: { tags: ["transactions"], params: idParam, response: { 200: transactionDTO } } },
    async (req) =>
      runAs(req, async (tx, user) => {
        const row = await tx.transaction.findFirst({
          where: { id: req.params.id, userId: user.id, deletedAt: null },
          include: transactionInclude,
        });
        if (!row) throw Errors.notFound("Lançamento");
        return toTransactionDTO(row);
      }),
  );

  // Cria (ou N parcelas). Repetir o mesmo `id` devolve o lançamento existente (200).
  app.post(
    "/",
    { schema: { tags: ["transactions"], body: createTransactionBody, response: { 200: transactionDTO, 201: transactionDTO } } },
    async (req, reply) => {
      const { rows, replayed } = await runMutation(req, (tx, user, ctx) =>
        createTransactions(tx, user, req.body, deps(), ctx),
      );
      return reply.code(replayed ? 200 : 201).send(toTransactionDTO(rows[0]!));
    },
  );

  // Atualização parcial: envie só os campos que mudam (+ expectedVersion para evitar sobrescrita).
  app.put(
    "/:id",
    { schema: { tags: ["transactions"], params: idParam, body: updateTransactionBody, response: { 200: transactionDTO } } },
    async (req) => {
      const rows = await runMutation(req, (tx, user, ctx) =>
        updateTransaction(tx, user, req.params.id, req.body, deps(), ctx),
      );
      const target = rows.find((r) => r.id === req.params.id) ?? rows[0]!;
      return toTransactionDTO(target);
    },
  );

  app.delete(
    "/:id",
    { schema: { tags: ["transactions"], params: idParam, querystring: deleteTransactionQuery, response: { 200: okResponse } } },
    async (req) => {
      await runMutation(req, (tx, user) => deleteTransaction(tx, user, req.params.id, req.query.scope, deps()));
      return { ok: true as const };
    },
  );
};

import {
  cardDTO,
  createCardBody,
  fromISODate,
  idParam,
  installmentPlanDTO,
  invoiceDetailDTO,
  invoiceDTO,
  invoicePaymentDTO,
  listAccountsQuery,
  listInvoicesQuery,
  listOf,
  okResponse,
  payInvoiceBody,
  todayIn,
  updateCardBody,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { runAs, runMutation } from "../../lib/db";
import { dateOut } from "../../lib/dto";
import { Errors } from "../../lib/errors";
import { invoiceTotals, syncInvoiceStatuses, toInvoiceDTO } from "../../lib/invoices";
import { decodeCursor, encodeCursor, slicePage } from "../../lib/pagination";
import { assertCanCreate } from "../../lib/plan";
import { requireAccount } from "../../lib/refs";
import { installmentPlans, invoiceDetail, listCardDTOs } from "./service";

const cardParams = z.object({ id: z.uuid() });
const invoiceParams = z.object({ id: z.uuid(), invoiceId: z.uuid() });
const paymentParams = z.object({ id: z.uuid(), invoiceId: z.uuid(), paymentId: z.uuid() });
const invoiceCursor = z.object({ m: z.string(), id: z.uuid() });

export const cardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    { schema: { tags: ["cards"], querystring: listAccountsQuery, response: { 200: z.object({ data: z.array(cardDTO) }) } } },
    async (req) =>
      runAs(req, async (tx, user) => ({
        data: await listCardDTOs(tx, user, app.clock(), { includeArchived: req.query.includeArchived }),
      })),
  );

  app.post(
    "/",
    { schema: { tags: ["cards"], body: createCardBody, response: { 201: cardDTO } } },
    async (req, reply) => {
      const b = req.body;
      const dto = await runMutation(req, async (tx, user) => {
        await assertCanCreate(tx, user, "cards");
        if (b.bankId) {
          const bank = await tx.bank.findUnique({ where: { id: b.bankId }, select: { id: true } });
          if (!bank) throw Errors.unprocessable("Banco não encontrado", "BANK_NOT_FOUND", { field: "bankId" });
        }
        if (b.payAccountId) await requireAccount(tx, user.id, b.payAccountId, { field: "payAccountId" });
        const clash = await tx.creditCard.findFirst({
          where: { userId: user.id, deletedAt: null, name: { equals: b.name, mode: "insensitive" } },
          select: { id: true },
        });
        if (clash) throw Errors.conflict("Já existe um cartão com este nome", "CARD_EXISTS");

        const created = await tx.creditCard.create({
          data: {
            userId: user.id,
            name: b.name,
            bankId: b.bankId ?? null,
            brand: b.brand,
            last4: b.last4 ?? null,
            limitCents: b.limitCents,
            closingDay: b.closingDay,
            dueDay: b.dueDay,
            payAccountId: b.payAccountId ?? null,
            color: b.color ?? null,
            icon: b.icon ?? null,
          },
        });
        const [card] = await listCardDTOs(tx, user, app.clock(), { ids: [created.id], includeArchived: true });
        return card!;
      });
      return reply.code(201).send(dto);
    },
  );

  app.get(
    "/:id",
    { schema: { tags: ["cards"], params: cardParams, response: { 200: cardDTO } } },
    async (req) =>
      runAs(req, async (tx, user) => {
        const [card] = await listCardDTOs(tx, user, app.clock(), { ids: [req.params.id], includeArchived: true });
        if (!card) throw Errors.notFound("Cartão");
        return card;
      }),
  );

  app.put(
    "/:id",
    { schema: { tags: ["cards"], params: cardParams, body: updateCardBody, response: { 200: cardDTO } } },
    async (req) => {
      const b = req.body;
      return runMutation(req, async (tx, user) => {
        const current = await tx.creditCard.findFirst({ where: { id: req.params.id, userId: user.id, deletedAt: null } });
        if (!current) throw Errors.notFound("Cartão");
        if (b.bankId) {
          const bank = await tx.bank.findUnique({ where: { id: b.bankId }, select: { id: true } });
          if (!bank) throw Errors.unprocessable("Banco não encontrado", "BANK_NOT_FOUND", { field: "bankId" });
        }
        if (b.payAccountId) await requireAccount(tx, user.id, b.payAccountId, { field: "payAccountId" });
        if (b.name !== undefined && b.name.toLowerCase() !== current.name.toLowerCase()) {
          const clash = await tx.creditCard.findFirst({
            where: { userId: user.id, deletedAt: null, id: { not: current.id }, name: { equals: b.name, mode: "insensitive" } },
            select: { id: true },
          });
          if (clash) throw Errors.conflict("Já existe um cartão com este nome", "CARD_EXISTS");
        }
        if (b.archived === false && current.archivedAt) await assertCanCreate(tx, user, "cards");

        // Mudar fechamento/vencimento vale para compras novas; faturas existentes mantêm suas datas.
        await tx.creditCard.update({
          where: { id: current.id },
          data: {
            ...(b.name !== undefined ? { name: b.name } : {}),
            ...(b.bankId !== undefined ? { bankId: b.bankId } : {}),
            ...(b.brand !== undefined ? { brand: b.brand } : {}),
            ...(b.last4 !== undefined ? { last4: b.last4 } : {}),
            ...(b.limitCents !== undefined ? { limitCents: b.limitCents } : {}),
            ...(b.closingDay !== undefined ? { closingDay: b.closingDay } : {}),
            ...(b.dueDay !== undefined ? { dueDay: b.dueDay } : {}),
            ...(b.payAccountId !== undefined ? { payAccountId: b.payAccountId } : {}),
            ...(b.color !== undefined ? { color: b.color } : {}),
            ...(b.icon !== undefined ? { icon: b.icon } : {}),
            ...(b.archived !== undefined ? { archivedAt: b.archived ? (current.archivedAt ?? app.clock()) : null } : {}),
          },
        });
        const [card] = await listCardDTOs(tx, user, app.clock(), { ids: [current.id], includeArchived: true });
        return card!;
      });
    },
  );

  // Só exclui cartões sem compras. Com histórico, o caminho é arquivar.
  app.delete(
    "/:id",
    { schema: { tags: ["cards"], params: cardParams, response: { 200: okResponse } } },
    async (req) => {
      await runMutation(req, async (tx, user) => {
        const card = await tx.creditCard.findFirst({ where: { id: req.params.id, userId: user.id, deletedAt: null } });
        if (!card) throw Errors.notFound("Cartão");
        const purchases = await tx.transaction.count({ where: { userId: user.id, cardId: card.id, deletedAt: null } });
        if (purchases > 0) {
          throw Errors.conflict("Este cartão tem compras. Arquive-o para preservar o histórico.", "CARD_HAS_TRANSACTIONS");
        }
        await tx.invoice.deleteMany({ where: { userId: user.id, cardId: card.id } });
        await tx.recurringRule.updateMany({
          where: { userId: user.id, cardId: card.id, deletedAt: null },
          data: { deletedAt: app.clock(), active: false },
        });
        await tx.creditCard.update({ where: { id: card.id }, data: { deletedAt: app.clock() } });
      });
      return { ok: true as const };
    },
  );

  // ---- Faturas

  app.get(
    "/:id/invoices",
    { schema: { tags: ["cards"], params: cardParams, querystring: listInvoicesQuery, response: { 200: listOf(invoiceDTO) } } },
    async (req) =>
      runAs(req, async (tx, user) => {
        const card = await tx.creditCard.findFirst({ where: { id: req.params.id, userId: user.id, deletedAt: null }, select: { id: true } });
        if (!card) throw Errors.notFound("Cartão");
        const today = todayIn(user.timezone, app.clock());
        const { period, limit, cursor } = req.query;

        // "upcoming" lista as mais próximas primeiro; os demais, as mais recentes primeiro.
        const asc = period === "upcoming";
        const cmp = asc ? "gt" : "lt";
        const c = cursor ? decodeCursor(cursor, invoiceCursor) : null;
        const rows = await tx.invoice.findMany({
          where: {
            userId: user.id,
            cardId: card.id,
            ...(period === "upcoming" ? { dueDate: { gte: fromISODate(today) } } : {}),
            ...(period === "history" ? { dueDate: { lt: fromISODate(today) } } : {}),
            ...(c
              ? {
                  OR: [
                    { referenceMonth: { [cmp]: fromISODate(c.m) } },
                    { referenceMonth: fromISODate(c.m), id: { [cmp]: c.id } },
                  ],
                }
              : {}),
          },
          orderBy: [{ referenceMonth: asc ? "asc" : "desc" }, { id: asc ? "asc" : "desc" }],
          take: limit + 1,
        });
        const { items, hasMore } = slicePage(rows, limit);
        const totals = await invoiceTotals(tx, user.id, { invoiceIds: items.map((i) => i.id) });
        let data = items.map((i) => toInvoiceDTO(i, totals.get(i.id), today));
        if (req.query.status) data = data.filter((d) => d.status === req.query.status);
        const last = items[items.length - 1];
        return {
          data,
          page: { hasMore, nextCursor: hasMore && last ? encodeCursor({ m: dateOut(last.referenceMonth), id: last.id }) : null },
        };
      }),
  );

  app.get(
    "/:id/invoices/:invoiceId",
    { schema: { tags: ["cards"], params: invoiceParams, response: { 200: invoiceDetailDTO } } },
    async (req) =>
      runAs(req, (tx, user) => invoiceDetail(tx, user, app.clock(), req.params.id, req.params.invoiceId)),
  );

  // Paga (total ou parcialmente) uma fatura: debita a conta, sem virar nova despesa.
  app.post(
    "/:id/invoices/:invoiceId/payments",
    { schema: { tags: ["cards"], params: invoiceParams, body: payInvoiceBody, response: { 201: invoicePaymentDTO } } },
    async (req, reply) => {
      const b = req.body;
      const dto = await runMutation(req, async (tx, user) => {
        const today = todayIn(user.timezone, app.clock());
        const invoice = await tx.invoice.findFirst({ where: { id: req.params.invoiceId, cardId: req.params.id, userId: user.id } });
        if (!invoice) throw Errors.notFound("Fatura");
        const totals = (await invoiceTotals(tx, user.id, { invoiceIds: [invoice.id] })).get(invoice.id);
        const total = totals?.totalCents ?? 0;
        const remaining = total - (totals?.paidCents ?? 0);
        if (total <= 0) throw Errors.conflict("A fatura não tem valor a pagar", "NOTHING_TO_PAY");
        if (remaining <= 0) throw Errors.conflict("A fatura já está paga", "ALREADY_PAID");
        const amount = b.amountCents ?? remaining;
        if (amount > remaining) {
          throw Errors.unprocessable("O valor é maior que o restante da fatura", "OVERPAYMENT", { remainingCents: remaining });
        }
        const account = await requireAccount(tx, user.id, b.accountId);
        const payment = await tx.invoicePayment.create({
          data: {
            userId: user.id,
            invoiceId: invoice.id,
            accountId: account.id,
            amountCents: amount,
            paidOn: fromISODate(b.paidOn ?? today),
            notes: b.notes ?? null,
          },
        });
        await syncInvoiceStatuses(tx, user.id, [invoice.id], today);
        return {
          id: payment.id,
          invoiceId: payment.invoiceId,
          account: { id: account.id, name: account.name, deleted: false },
          amountCents: amount,
          paidOn: dateOut(payment.paidOn),
          notes: payment.notes,
        };
      });
      return reply.code(201).send(dto);
    },
  );

  app.delete(
    "/:id/invoices/:invoiceId/payments/:paymentId",
    { schema: { tags: ["cards"], params: paymentParams, response: { 200: okResponse } } },
    async (req) => {
      await runMutation(req, async (tx, user) => {
        const payment = await tx.invoicePayment.findFirst({
          where: { id: req.params.paymentId, invoiceId: req.params.invoiceId, userId: user.id, invoice: { cardId: req.params.id } },
        });
        if (!payment) throw Errors.notFound("Pagamento");
        await tx.invoicePayment.delete({ where: { id: payment.id } });
        await syncInvoiceStatuses(tx, user.id, [payment.invoiceId], todayIn(user.timezone, app.clock()));
      });
      return { ok: true as const };
    },
  );

  // ---- Compras parceladas em andamento

  app.get(
    "/:id/installments",
    { schema: { tags: ["cards"], params: cardParams, response: { 200: z.object({ data: z.array(installmentPlanDTO) }) } } },
    async (req) =>
      runAs(req, async (tx, user) => {
        const card = await tx.creditCard.findFirst({ where: { id: req.params.id, userId: user.id, deletedAt: null }, select: { id: true } });
        if (!card) throw Errors.notFound("Cartão");
        return { data: await installmentPlans(tx, user, app.clock(), card.id) };
      }),
  );
};

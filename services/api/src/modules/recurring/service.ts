import type { Prisma, PrismaClient } from "@app/database";
import { withUser } from "@app/database";
import {
  addDays,
  fromISODate,
  nextOccurrence,
  occurrencesBetween,
  todayIn,
  type ISODate,
  type RecurrenceRule,
  type RecurringRuleDTO,
} from "@app/shared";
import { randomUUID } from "node:crypto";
import type { OpCtx, Tx } from "../../lib/db";
import { dateOut, num, tsOut } from "../../lib/dto";
import { ensureInvoice, syncInvoiceStatuses } from "../../lib/invoices";
import { evaluateBudgetAlerts } from "../budgets/service";
import type { PushNotifier } from "../notifications/notifier";

const refSelect = { select: { id: true, name: true, deletedAt: true } } as const;

export const ruleInclude = {
  account: refSelect,
  toAccount: refSelect,
  card: refSelect,
  category: { select: { id: true, name: true, icon: true, color: true, type: true, deletedAt: true } },
} satisfies Prisma.RecurringRuleInclude;

export type RuleRow = Prisma.RecurringRuleGetPayload<{ include: typeof ruleInclude }>;

const ref = (x: { id: string; name: string; deletedAt: Date | null }) => ({ id: x.id, name: x.name, deleted: x.deletedAt !== null });

export function toRuleDTO(r: RuleRow): RecurringRuleDTO {
  return {
    id: r.id,
    type: r.type,
    description: r.description,
    amountCents: num(r.amountCents),
    account: r.account ? ref(r.account) : null,
    toAccount: r.toAccount ? ref(r.toAccount) : null,
    card: r.card ? ref(r.card) : null,
    category: r.category
      ? { id: r.category.id, name: r.category.name, icon: r.category.icon, color: r.category.color, type: r.category.type, deleted: r.category.deletedAt !== null }
      : null,
    paymentMethod: r.paymentMethod,
    frequency: r.frequency,
    intervalCount: r.intervalCount,
    dayOfMonth: r.dayOfMonth,
    startDate: dateOut(r.startDate),
    endDate: r.endDate ? dateOut(r.endDate) : null,
    nextRunOn: dateOut(r.nextRunOn),
    lastRunOn: r.lastRunOn ? dateOut(r.lastRunOn) : null,
    active: r.active,
    notes: r.notes,
    createdAt: tsOut(r.createdAt),
  };
}

export function ruleShape(r: { frequency: RecurrenceRule["frequency"]; intervalCount: number; dayOfMonth: number | null; startDate: Date; endDate: Date | null }): RecurrenceRule {
  return {
    frequency: r.frequency,
    intervalCount: r.intervalCount,
    dayOfMonth: r.dayOfMonth,
    startDate: dateOut(r.startDate),
    endDate: r.endDate ? dateOut(r.endDate) : null,
  };
}

/**
 * Gera os lançamentos devidos de UMA regra, até `today`. Idempotente:
 * (recurrence_id, occurred_on) é único, então rodar duas vezes não duplica
 * nem recria uma ocorrência que o usuário excluiu.
 * Retorna quantas ocorrências foram geradas.
 */
export async function generateForRule(
  tx: Tx,
  user: { id: string },
  rule: Prisma.RecurringRuleGetPayload<{ include: typeof dueRuleInclude }>,
  today: ISODate,
  deps: { notifier: PushNotifier },
  ctx: OpCtx,
): Promise<number> {
  if (!rule.active || rule.deletedAt) return 0;
  const nextRun = dateOut(rule.nextRunOn);
  if (nextRun > today) return 0;
  // Conta/cartão arquivados: pausa a geração (retoma ao desarquivar, recuperando o atraso).
  if (rule.account && (rule.account.archivedAt || rule.account.deletedAt)) return 0;
  if (rule.toAccount && (rule.toAccount.archivedAt || rule.toAccount.deletedAt)) return 0;
  if (rule.card && (rule.card.archivedAt || rule.card.deletedAt)) return 0;

  const shape = ruleShape(rule);
  const dates = occurrencesBetween(shape, nextRun, today, 366);
  if (dates.length === 0) return 0;

  let createdCount: number;
  const invoiceIds: string[] = [];
  if (rule.type === "TRANSFER") {
    createdCount = await createTransferOccurrences(tx, user.id, rule, dates);
  } else {
    const data: Prisma.TransactionCreateManyInput[] = [];
    for (const date of dates) {
      const invoiceId = rule.card ? await ensureInvoice(tx, user.id, rule.card, date) : null;
      if (invoiceId) invoiceIds.push(invoiceId);
      data.push({
        id: randomUUID(),
        userId: user.id,
        type: rule.type,
        status: "POSTED",
        description: rule.description,
        amountCents: rule.amountCents,
        occurredOn: fromISODate(date),
        accountId: rule.accountId,
        cardId: rule.cardId,
        categoryId: rule.categoryId,
        paymentMethod: rule.paymentMethod,
        invoiceId,
        recurrenceId: rule.id,
        notes: rule.notes,
      });
    }
    createdCount = (await tx.transaction.createMany({ data, skipDuplicates: true })).count;
  }

  const last = dates[dates.length - 1]!;
  const next = nextOccurrence(shape, last);
  await tx.recurringRule.update({
    where: { id: rule.id },
    data: { lastRunOn: fromISODate(last), nextRunOn: fromISODate(next ?? last), active: next !== null },
  });

  await syncInvoiceStatuses(tx, user.id, invoiceIds, today);
  if (rule.type === "EXPENSE") {
    await evaluateBudgetAlerts(tx, user, deps, ctx, { categoryId: rule.categoryId, occurredOn: last, today });
  }
  return createdCount;
}

/**
 * Transferência recorrente: cada data vira uma transferência de verdade (cabeçalho + as duas pernas, saída e entrada). Só a perna de SAÍDA leva o
 * `recurrence_id`; é ela que garante que rodar duas vezes não duplica nem recria uma ocorrência que a pessoa excluiu (a exclusão é lógica, a linha
 * continua lá).
 */
async function createTransferOccurrences(
  tx: Tx,
  userId: string,
  rule: { id: string; accountId: string | null; toAccountId: string | null; amountCents: bigint; notes: string | null },
  dates: ISODate[],
): Promise<number> {
  const accounts = await tx.account.findMany({ where: { userId, id: { in: [rule.accountId!, rule.toAccountId!] } }, select: { id: true, name: true } });
  const from = accounts.find((a) => a.id === rule.accountId);
  const to = accounts.find((a) => a.id === rule.toAccountId);
  if (!from || !to) return 0;
  const already = await tx.transaction.findMany({ where: { recurrenceId: rule.id, occurredOn: { in: dates.map(fromISODate) } }, select: { occurredOn: true } });
  const seen = new Set(already.map((r) => dateOut(r.occurredOn)));
  let created = 0;
  for (const date of dates) {
    if (seen.has(date)) continue;
    const transferId = randomUUID();
    await tx.transfer.create({
      data: { id: transferId, userId, fromAccountId: from.id, toAccountId: to.id, amountCents: rule.amountCents, occurredOn: fromISODate(date), notes: rule.notes },
    });
    const base = { userId, type: "TRANSFER" as const, status: "POSTED" as const, amountCents: rule.amountCents, occurredOn: fromISODate(date), paymentMethod: "OTHER" as const, transferId };
    await tx.transaction.createMany({
      data: [
        { ...base, description: `Transferência para ${to.name}`, accountId: from.id, transferSide: "OUT", recurrenceId: rule.id },
        { ...base, description: `Transferência de ${from.name}`, accountId: to.id, transferSide: "IN" },
      ],
    });
    created++;
  }
  return created;
}

export const dueRuleInclude = {
  account: { select: { archivedAt: true, deletedAt: true } },
  toAccount: { select: { archivedAt: true, deletedAt: true } },
  card: { select: { id: true, closingDay: true, dueDay: true, archivedAt: true, deletedAt: true } },
} as const;

/** Gera tudo que está atrasado para um usuário (dashboard, "rodar agora" e job). */
export async function catchUpUser(
  tx: Tx,
  user: { id: string; timezone: string },
  now: Date,
  deps: { notifier: PushNotifier },
  ctx: OpCtx,
): Promise<number> {
  const today = todayIn(user.timezone, now);
  const rules = await tx.recurringRule.findMany({
    where: { userId: user.id, active: true, deletedAt: null, nextRunOn: { lte: fromISODate(today) } },
    include: dueRuleInclude,
  });
  let total = 0;
  for (const rule of rules) total += await generateForRule(tx, user, rule, today, deps, ctx);
  return total;
}

/**
 * Job: processa as recorrências vencidas de TODOS os usuários, cada um numa transação
 * com RLS ativo em nome dele (nunca mistura dados). Erros de um usuário não param os demais.
 */
export async function runDueRecurrences(
  prisma: PrismaClient,
  now: Date,
  deps: { notifier: PushNotifier },
  log?: { error: (obj: object, msg: string) => void },
): Promise<{ users: number; generated: number }> {
  // Candidatos: regras cuja data venceu em UTC+1 dia (cobre qualquer fuso); o fuso exato é checado por usuário.
  const horizon = fromISODate(addDays(todayIn("UTC", now), 1));
  const candidates = await prisma.recurringRule.findMany({
    where: { active: true, deletedAt: null, nextRunOn: { lte: horizon } },
    distinct: ["userId"],
    select: { userId: true, user: { select: { status: true, profile: { select: { timezone: true } } } } },
  });

  let generated = 0;
  let users = 0;
  for (const c of candidates) {
    if (c.user.status !== "ACTIVE") continue;
    const user = { id: c.userId, timezone: c.user.profile?.timezone ?? "America/Sao_Paulo" };
    const callbacks: Array<() => Promise<void> | void> = [];
    try {
      const n = await withUser(prisma, user.id, (tx) =>
        catchUpUser(tx, user, now, deps, { afterCommit: (cb) => void callbacks.push(cb) }),
      );
      generated += n;
      users++;
      for (const cb of callbacks) await cb();
    } catch (err) {
      log?.error({ err, userId: user.id }, "falha ao gerar recorrências");
    }
  }
  return { users, generated };
}

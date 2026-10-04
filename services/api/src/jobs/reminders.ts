import type { PrismaClient } from "@app/database";
import { withUser } from "@app/database";
import { addDays, diffDays, formatBRL, fromISODate, occurrencesBetween, todayIn, type ISODate } from "@app/shared";
import { dateOut, num } from "../lib/dto";
import { invoiceTotals } from "../lib/invoices";
import { createNotifications, type NewNotification } from "../modules/notifications/service";
import type { PushNotifier } from "../modules/notifications/notifier";
import { ruleShape } from "../modules/recurring/service";

const WINDOW_DAYS = 3;
/** Não incomoda de madrugada: lembretes só entre 8h e 21h no fuso do usuário. */
const FIRST_HOUR = 8;
const LAST_HOUR = 21;

export function localHour(timezone: string, now: Date): number {
  try {
    const h = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hour12: false }).format(now);
    return Number(h) % 24;
  } catch {
    return now.getUTCHours();
  }
}

function when(today: ISODate, date: ISODate): string {
  const d = diffDays(today, date);
  return d === 0 ? "vence hoje" : d === 1 ? "vence amanhã" : `vence em ${d} dias`;
}

/**
 * Gera lembretes de contas e faturas a vencer nos próximos 3 dias.
 * Idempotente (dedupeKey por item e data), então pode rodar de hora em hora.
 * Cada usuário é processado sob RLS em nome dele.
 */
export async function runReminders(
  prisma: PrismaClient,
  now: Date,
  deps: { notifier: PushNotifier },
  log?: { error: (obj: object, msg: string) => void },
): Promise<{ users: number; created: number }> {
  // Candidatos com margem de fuso (UTC-1 .. UTC+4 dias); a janela exata é checada por usuário.
  const lo = fromISODate(addDays(todayIn("UTC", now), -1));
  const hi = fromISODate(addDays(todayIn("UTC", now), WINDOW_DAYS + 1));

  const ids = new Set<string>();
  (await prisma.invoice.findMany({ where: { dueDate: { gte: lo, lte: hi } }, distinct: ["userId"], select: { userId: true } })).forEach((r) => ids.add(r.userId));
  (await prisma.transaction.findMany({
    where: { status: "PENDING", deletedAt: null, type: "EXPENSE", occurredOn: { gte: lo, lte: hi } },
    distinct: ["userId"],
    select: { userId: true },
  })).forEach((r) => ids.add(r.userId));
  (await prisma.recurringRule.findMany({
    where: { active: true, deletedAt: null, type: "EXPENSE", nextRunOn: { lte: hi } },
    distinct: ["userId"],
    select: { userId: true },
  })).forEach((r) => ids.add(r.userId));

  let created = 0;
  let users = 0;
  for (const userId of ids) {
    try {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { status: true, profile: { select: { timezone: true } } },
      });
      if (!u || u.status !== "ACTIVE") continue;
      const timezone = u.profile?.timezone ?? "America/Sao_Paulo";
      const hour = localHour(timezone, now);
      if (hour < FIRST_HOUR || hour >= LAST_HOUR) continue;

      const today = todayIn(timezone, now);
      const end = addDays(today, WINDOW_DAYS);
      const callbacks: Array<() => Promise<void> | void> = [];
      const n = await withUser(prisma, userId, async (tx) => {
        const items: NewNotification[] = [];

        // faturas
        const invoices = await tx.invoice.findMany({
          where: { userId, dueDate: { gte: fromISODate(today), lte: fromISODate(end) }, card: { deletedAt: null } },
          include: { card: { select: { name: true } } },
        });
        const totals = await invoiceTotals(tx, userId, { invoiceIds: invoices.map((i) => i.id) });
        for (const inv of invoices) {
          const t = totals.get(inv.id);
          const remaining = (t?.totalCents ?? 0) - (t?.paidCents ?? 0);
          if (remaining <= 0) continue;
          const due = dateOut(inv.dueDate);
          items.push({
            type: "INVOICE_DUE",
            title: "Fatura próxima do vencimento",
            body: `A fatura do ${inv.card.name} ${when(today, due)} (${formatBRL(remaining)}).`,
            data: { invoiceId: inv.id, cardId: inv.cardId, dueDate: due },
            dedupeKey: `invoice:${inv.id}:${due}`,
          });
        }

        // contas lançadas como pendentes (a pagar)
        const pending = await tx.transaction.findMany({
          where: { userId, status: "PENDING", deletedAt: null, type: "EXPENSE", occurredOn: { gte: fromISODate(today), lte: fromISODate(end) } },
        });
        for (const p of pending) {
          const due = dateOut(p.occurredOn);
          items.push({
            type: "BILL_DUE",
            title: "Conta próxima do vencimento",
            body: `${p.description} (${formatBRL(num(p.amountCents))}) ${when(today, due)}.`,
            data: { transactionId: p.id, dueDate: due },
            dedupeKey: `pending:${p.id}`,
          });
        }

        // recorrências que vencem nos próximos dias (a de hoje é lançada automaticamente)
        const rules = await tx.recurringRule.findMany({ where: { userId, active: true, deletedAt: null, type: "EXPENSE" } });
        for (const r of rules) {
          for (const date of occurrencesBetween(ruleShape(r), dateOut(r.nextRunOn), end, 10)) {
            if (date <= today) continue;
            items.push({
              type: "BILL_DUE",
              title: "Conta próxima do vencimento",
              body: `${r.description} (${formatBRL(num(r.amountCents))}) ${when(today, date)}.`,
              data: { ruleId: r.id, dueDate: date },
              dedupeKey: `rule:${r.id}:${date}`,
            });
          }
        }

        return createNotifications(tx, userId, items, { afterCommit: (cb) => void callbacks.push(cb) }, deps.notifier);
      });
      for (const cb of callbacks) await cb();
      created += n;
      users++;
    } catch (err) {
      log?.error({ err, userId }, "falha ao gerar lembretes");
    }
  }
  return { users, created };
}

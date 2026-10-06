import type { BankConnectionAccount, BankTransaction, PrismaClient } from "@app/database";
import { addDays, fromISODate, toISODate, type ISODate } from "@app/shared";
import type { FastifyBaseLogger } from "fastify";
import { planOf, resolveAccess, type AccessConfig } from "../../lib/access";
import { loadAccess } from "../../lib/access-db";
import { accountBalances } from "../../lib/balances";
import type { OpCtx, Tx } from "../../lib/db";
import { dateOut, num } from "../../lib/dto";
import { invoiceTotals, syncInvoiceStatuses } from "../../lib/invoices";
import { countUsage, limitsFor } from "../../lib/plan";
import type { AuthUser } from "../../types";
import type { PushNotifier } from "../notifications/notifier";
import { createTransactions } from "../transactions/service";

/**
 * "Puxar tudo automaticamente": depois que o usuário conecta o banco, a sincronização
 *   1. cria a conta/cartão do app que corresponde a cada conta/cartão do banco (se ainda não houver vínculo);
 *   2. concilia cada transação nova com um lançamento manual parecido, ou a importa como lançamento;
 *   3. ancora o saldo inicial das contas criadas no saldo informado pelo banco.
 * Tudo roda como dono do banco (sem RLS): toda consulta filtra por `userId` explicitamente.
 * Quem prefere revisar manualmente desliga `autoImport` na conexão.
 */

export type AutoDeps = {
  prisma: PrismaClient;
  notifier: PushNotifier;
  now: () => Date;
  access: AccessConfig;
  log?: FastifyBaseLogger;
};

type Conn = { id: string; userId: string; institutionName: string };

export type AutoResult = { accountsCreated: number; cardsCreated: number; imported: number; matched: number };

// ---------------------------------------------------------------------------- regras reaproveitadas

/** Descrições de banco costumam vir em caixa alta e com espaços extras. */
export function cleanDescription(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim().slice(0, 200) || "Transação bancária";
  return s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s;
}

/** Forma de pagamento provável pela descrição que o banco manda (padrão: outro). */
export function guessPaymentMethod(description: string): "PIX" | "BOLETO" | "TED_DOC" | "OTHER" {
  if (/\bpix\b/i.test(description)) return "PIX";
  if (/boleto/i.test(description)) return "BOLETO";
  if (/\b(ted|doc)\b/i.test(description)) return "TED_DOC";
  return "OTHER";
}

/** Lançamento manual com mesmo valor, mesmo tipo e data próxima (±3 dias) na mesma conta/cartão. */
export async function suggestMatch(
  tx: Tx,
  userId: string,
  bt: Pick<BankTransaction, "direction" | "amountCents" | "postedOn">,
  link: { accountId: string | null; cardId: string | null } | undefined,
): Promise<{ transactionId: string; description: string; occurredOn: string } | null> {
  if (!link || (!link.accountId && !link.cardId)) return null;
  const posted = dateOut(bt.postedOn);
  const found = await tx.transaction.findFirst({
    where: {
      userId,
      deletedAt: null,
      bankTransactionId: null,
      transferId: null,
      type: bt.direction === "CREDIT" ? "INCOME" : "EXPENSE",
      amountCents: bt.amountCents,
      occurredOn: { gte: fromISODate(addDays(posted, -3)), lte: fromISODate(addDays(posted, 3)) },
      ...(link.accountId ? { accountId: link.accountId } : { cardId: link.cardId }),
    },
    orderBy: { occurredOn: "asc" },
    select: { id: true, description: true, occurredOn: true },
  });
  return found ? { transactionId: found.id, description: found.description, occurredOn: dateOut(found.occurredOn) } : null;
}

/** Descrição de débito que parece pagamento de fatura de cartão ("PAGAMENTO FATURA", "PAG FATURA CARTAO"...). */
export function looksLikeCardPayment(description: string): boolean {
  return /fatura|cart[aã]o|cartao de cr[eé]dito/i.test(description);
}

/**
 * Débito na conta que paga a fatura do cartão: vira PAGAMENTO DE FATURA (como o "Pagar fatura" do app: baixa o
 * saldo da conta sem virar despesa nova, porque as compras já estão na fatura). Aplica nas faturas fechadas em
 * aberto, da mais antiga para a mais nova; o que sobrar fica como pagamento a maior na última, para o saldo da
 * conta continuar batendo com o do banco. Retorna false (e nada muda) se não achar fatura para quitar.
 */
async function applyCardPayment(
  tx: Tx,
  userId: string,
  accountId: string,
  bt: Pick<BankTransaction, "amountCents" | "postedOn" | "descriptionRaw">,
  today: ISODate,
): Promise<boolean> {
  const cards = await tx.creditCard.findMany({ where: { userId, payAccountId: accountId, deletedAt: null }, select: { id: true } });
  if (cards.length === 0) return false;
  const posted = dateOut(bt.postedOn);
  const invoices = await tx.invoice.findMany({
    where: { userId, cardId: { in: cards.map((c) => c.id) }, closingDate: { lte: fromISODate(posted) } },
    orderBy: [{ dueDate: "asc" }],
  });
  const totals = await invoiceTotals(tx, userId, { invoiceIds: invoices.map((i) => i.id) });
  const open = invoices
    .map((i) => ({ id: i.id, remaining: (totals.get(i.id)?.totalCents ?? 0) - (totals.get(i.id)?.paidCents ?? 0) }))
    .filter((i) => i.remaining > 0);
  if (open.length === 0) return false;

  // Com mais de um cartão pagando por esta conta, prefere a fatura de valor igual ao do pagamento.
  const amount = num(bt.amountCents);
  const exact = open.find((i) => i.remaining === amount);
  const order = exact ? [exact, ...open.filter((i) => i !== exact)] : open;

  let left = amount;
  const touched: string[] = [];
  for (const inv of order) {
    if (left <= 0) break;
    const pay = Math.min(inv.remaining, left);
    await tx.invoicePayment.create({
      data: { userId, invoiceId: inv.id, accountId, amountCents: pay, paidOn: bt.postedOn, notes: "Importado do banco" },
    });
    touched.push(inv.id);
    left -= pay;
  }
  if (left > 0) {
    await tx.invoicePayment.create({
      data: { userId, invoiceId: touched[touched.length - 1]!, accountId, amountCents: left, paidOn: bt.postedOn, notes: "Importado do banco (valor acima da fatura)" },
    });
  }
  await syncInvoiceStatuses(tx, userId, touched, today);
  return true;
}

// ---------------------------------------------------------------------------- vínculo automático

function brandOf(raw: string | null): "VISA" | "MASTERCARD" | "ELO" | "AMEX" | "HIPERCARD" | "OTHER" {
  const b = (raw ?? "").toUpperCase();
  if (b.includes("VISA")) return "VISA";
  if (b.includes("MASTER")) return "MASTERCARD";
  if (b.includes("ELO")) return "ELO";
  if (b.includes("AMEX") || b.includes("AMERICAN")) return "AMEX";
  if (b.includes("HIPER")) return "HIPERCARD";
  return "OTHER";
}

/** "Nubank · Conta" sem repetir um nome que o usuário já tem ("Nubank · Conta (2)"). */
function uniqueName(base: string, taken: Set<string>): string {
  const clean = base.replace(/\s+/g, " ").trim().slice(0, 80);
  let name = clean;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${clean.slice(0, 80 - String(n).length - 3)} (${n})`;
  taken.add(name.toLowerCase());
  return name;
}

/**
 * Cria a conta/cartão do app para cada conta/cartão do banco que ainda não tem vínculo.
 * Respeita o limite do plano (sem exceção: acima dele, o item fica sem vínculo e o app avisa).
 * Cartão só é criado quando o banco informou as datas de fechamento e vencimento (o app precisa delas).
 * Retorna as contas novas (para ancorar o saldo) e as contagens.
 */
export async function autoLinkAccounts(
  deps: AutoDeps,
  conn: Conn,
  links: BankConnectionAccount[],
): Promise<{ createdAccounts: { linkId: string; accountId: string; balanceCents: number | null }[]; accounts: number; cards: number }> {
  const { prisma } = deps;
  const out = { createdAccounts: [] as { linkId: string; accountId: string; balanceCents: number | null }[], accounts: 0, cards: 0 };
  const pending = links.filter((l) => !l.accountId && !l.cardId).sort((a, b) => (a.kind === "BANK" ? -1 : 1) - (b.kind === "BANK" ? -1 : 1));
  if (pending.length === 0) return out;

  const access = await loadAccess(prisma, conn.userId, deps.access, deps.now());
  const limits = limitsFor(access ? planOf(access) : "FREE");
  const usage = await countUsage(prisma, conn.userId);
  const accountNames = new Set((await prisma.account.findMany({ where: { userId: conn.userId, deletedAt: null }, select: { name: true } })).map((a) => a.name.toLowerCase()));
  const cardNames = new Set((await prisma.creditCard.findMany({ where: { userId: conn.userId, deletedAt: null }, select: { name: true } })).map((c) => c.name.toLowerCase()));
  // Conta que paga a fatura: a primeira conta corrente desta conexão (já vinculada ou recém-criada).
  let payAccountId = links.find((l) => l.kind === "BANK" && l.accountId)?.accountId ?? null;

  for (const l of pending) {
    const label = `${conn.institutionName} · ${l.displayName ?? (l.kind === "CREDIT" ? "Cartão" : "Conta")}`;
    try {
      if (l.kind === "BANK") {
        if (limits.accounts !== null && usage.accounts >= limits.accounts) {
          deps.log?.info({ connectionId: conn.id }, "conta do banco sem vínculo: limite de contas do plano");
          continue;
        }
        const name = uniqueName(label, accountNames);
        const accountId = await prisma.$transaction(async (tx) => {
          const account = await tx.account.create({
            data: { userId: conn.userId, name, type: "CHECKING", openingBalanceCents: 0, source: "OPEN_FINANCE", icon: "landmark" },
            select: { id: true },
          });
          // Corrida (webhook + sincronização manual): só vale se NINGUÉM vinculou antes; senão desfaz.
          const claimed = await tx.bankConnectionAccount.updateMany({ where: { id: l.id, accountId: null, cardId: null }, data: { accountId: account.id } });
          if (claimed.count === 0) throw new Error("ALREADY_LINKED");
          return account.id;
        });
        usage.accounts++;
        out.accounts++;
        payAccountId ??= accountId;
        out.createdAccounts.push({ linkId: l.id, accountId, balanceCents: l.balanceCents === null ? null : num(l.balanceCents) });
      } else {
        if (limits.cards !== null && usage.cards >= limits.cards) {
          deps.log?.info({ connectionId: conn.id }, "cartão do banco sem vínculo: limite de cartões do plano");
          continue;
        }
        if (!l.billCloseDate || !l.billDueDate) {
          deps.log?.info({ connectionId: conn.id }, "cartão do banco sem datas de fechamento/vencimento: aguardando a próxima leitura");
          continue;
        }
        const name = uniqueName(label, cardNames);
        await prisma.$transaction(async (tx) => {
          const card = await tx.creditCard.create({
            data: {
              userId: conn.userId,
              name,
              brand: brandOf(l.cardBrand),
              limitCents: l.creditLimitCents ?? 0,
              closingDay: l.billCloseDate!.getUTCDate(),
              dueDay: l.billDueDate!.getUTCDate(),
              payAccountId,
              source: "OPEN_FINANCE",
              icon: "credit-card",
            },
            select: { id: true },
          });
          const claimed = await tx.bankConnectionAccount.updateMany({ where: { id: l.id, accountId: null, cardId: null }, data: { cardId: card.id } });
          if (claimed.count === 0) throw new Error("ALREADY_LINKED");
        });
        usage.cards++;
        out.cards++;
      }
    } catch (err) {
      if (err instanceof Error && err.message === "ALREADY_LINKED") continue;
      deps.log?.warn({ err, connectionId: conn.id }, "não foi possível criar a conta/cartão automaticamente");
    }
  }
  return out;
}

/**
 * Faz o saldo calculado do app bater com o saldo do banco numa conta recém-criada:
 * saldo inicial = saldo do banco − o que as transações importadas já somam.
 */
export async function anchorOpeningBalance(deps: AutoDeps, userId: string, accountId: string, bankBalanceCents: number | null): Promise<void> {
  if (bankBalanceCents === null) return;
  const today = toISODate(deps.now());
  const current = (await accountBalances(deps.prisma, userId, today, [accountId])).get(accountId) ?? 0; // saldo inicial era 0
  await deps.prisma.account.update({ where: { id: accountId }, data: { openingBalanceCents: bankBalanceCents - current } });
}

// ---------------------------------------------------------------------------- importação automática

async function authUserFor(deps: AutoDeps, userId: string): Promise<AuthUser> {
  const { prisma } = deps;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { timezone: true } });
  const access = (await loadAccess(prisma, userId, deps.access, deps.now())) ?? resolveAccess({ role: "USER", createdAt: new Date(0), subscription: null, config: deps.access, now: deps.now() });
  return {
    id: userId,
    email: user?.email ?? "",
    role: user?.role ?? "USER",
    plan: planOf(access),
    access,
    timezone: profile?.timezone ?? "America/Sao_Paulo",
    consentOk: true,
  };
}

/**
 * Trata todas as transações NOVAS de uma conta/cartão vinculado: concilia com um lançamento manual parecido
 * (sem duplicar) ou importa como lançamento. Cada transação é uma transação de banco própria: uma que falhe
 * não impede as outras (ela continua NOVA e será tentada na próxima sincronização).
 */
export async function autoImportNew(deps: AutoDeps, conn: Conn, link: BankConnectionAccount): Promise<{ imported: number; matched: number }> {
  const { prisma } = deps;
  const result = { imported: 0, matched: 0 };
  if (!link.accountId && !link.cardId) return result;

  const rows = await prisma.bankTransaction.findMany({
    where: { userId: conn.userId, connectionId: conn.id, providerAccountId: link.providerAccountId, status: "NEW" },
    orderBy: [{ postedOn: "asc" }, { id: "asc" }],
    take: 2000,
  });
  if (rows.length === 0) return result;
  const user = await authUserFor(deps, conn.userId);

  for (const bt of rows) {
    // Pagamento/estorno de fatura não vira lançamento (a fatura é paga pela conta).
    if (link.cardId && bt.direction === "CREDIT") {
      await prisma.bankTransaction.update({ where: { id: bt.id }, data: { status: "IGNORED" } });
      continue;
    }
    const callbacks: Array<() => Promise<void> | void> = [];
    const ctx: OpCtx = { afterCommit: (cb) => void callbacks.push(cb) };
    try {
      const kind = await prisma.$transaction(async (tx) => {
        // Débito que paga a fatura do cartão: quita a fatura em vez de virar despesa.
        if (link.accountId && bt.direction === "DEBIT" && looksLikeCardPayment(bt.descriptionRaw)) {
          if (await applyCardPayment(tx, conn.userId, link.accountId, bt, toISODate(deps.now()))) {
            await tx.bankTransaction.update({ where: { id: bt.id }, data: { status: "IMPORTED" } });
            return "imported" as const;
          }
        }
        const match = await suggestMatch(tx, conn.userId, bt, link);
        if (match) {
          await tx.transaction.update({ where: { id: match.transactionId }, data: { bankTransactionId: bt.id } });
          await tx.bankTransaction.update({ where: { id: bt.id }, data: { status: "MATCHED" } });
          return "matched" as const;
        }
        const description = cleanDescription(bt.descriptionRaw);
        const { rows: created } = await createTransactions(
          tx,
          user,
          {
            type: bt.direction === "CREDIT" ? "INCOME" : "EXPENSE",
            description,
            amountCents: num(bt.amountCents),
            occurredOn: dateOut(bt.postedOn),
            accountId: link.accountId,
            cardId: link.cardId,
            categoryId: null,
            paymentMethod: link.cardId ? "CREDIT" : guessPaymentMethod(bt.descriptionRaw),
            status: "POSTED",
          },
          { notifier: deps.notifier, now: deps.now() },
          ctx,
        );
        // A origem fica registrada pelo vínculo com a transação do banco (bank_transaction_id).
        await tx.transaction.update({ where: { id: created[0]!.id }, data: { bankTransactionId: bt.id } });
        await tx.bankTransaction.update({ where: { id: bt.id }, data: { status: "IMPORTED" } });
        return "imported" as const;
      });
      result[kind === "matched" ? "matched" : "imported"]++;
      for (const cb of callbacks) {
        try {
          await cb();
        } catch (err) {
          deps.log?.error({ err }, "falha em ação pós-importação");
        }
      }
    } catch (err) {
      deps.log?.warn({ err, connectionId: conn.id }, "não foi possível importar uma transação do banco; fica para a próxima sincronização");
    }
  }
  return result;
}

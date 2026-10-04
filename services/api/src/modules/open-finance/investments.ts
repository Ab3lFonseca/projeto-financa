import type { Prisma, PrismaClient } from "@app/database";
import {
  addDays,
  fromISODate,
  investmentGroupKey,
  investmentLabelPt,
  investmentRateLabel,
  profitPct,
  toISODate,
  type BankOverviewDTO,
  type InvestmentDetailDTO,
  type InvestmentDTO,
  type InvestmentsResponse,
} from "@app/shared";
import type { FastifyBaseLogger } from "fastify";
import type { Tx } from "../../lib/db";
import { dateOut, num, tsOut } from "../../lib/dto";
import { Errors } from "../../lib/errors";
import type { OpenFinanceProvider } from "./provider";

const HISTORY_DAYS = 180;

// ---------------------------------------------------------------------------- sincronização

/**
 * Lê os investimentos da conexão (CDB, caixinhas/cofrinhos, LCI/LCA, fundos...) e guarda a posição de hoje,
 * mais uma "foto" por dia para o gráfico de evolução. Idempotente: rodar de novo no mesmo dia só atualiza.
 *
 * Roda como dono do banco (sem RLS): todas as consultas filtram por `userId`.
 * Nunca derruba a sincronização inteira: se a leitura falhar, contas e transações seguem normalmente.
 * Retorna quantos investimentos ativos existem na conexão.
 */
export async function syncInvestments(
  prisma: PrismaClient,
  provider: OpenFinanceProvider,
  conn: { id: string; userId: string; providerItemId: string },
  opts: { partial: boolean; now: Date; log?: FastifyBaseLogger },
): Promise<number> {
  let list;
  try {
    list = await provider.listInvestments(conn.providerItemId);
  } catch (err) {
    opts.log?.warn({ err, connectionId: conn.id }, "leitura de investimentos falhou; seguindo sem eles");
    return 0;
  }

  const today = fromISODate(toISODate(opts.now));
  let active = 0;
  for (const inv of list) {
    const closedNow = inv.status === "TOTAL_WITHDRAWAL";
    const key = { connectionId_providerInvestmentId: { connectionId: conn.id, providerInvestmentId: inv.id } };
    const existing = await prisma.bankInvestment.findUnique({ where: key, select: { closedAt: true } });
    const data = {
      name: inv.name,
      type: inv.type,
      subtype: inv.subtype,
      issuer: inv.issuer,
      status: inv.status,
      balanceCents: inv.balanceCents,
      investedCents: inv.investedCents,
      profitCents: inv.profitCents,
      withdrawableCents: inv.withdrawableCents,
      rateType: inv.rateType,
      rate: inv.rate,
      fixedAnnualRate: inv.fixedAnnualRate,
      annualRate: inv.annualRate,
      issueDate: inv.issueDate ? fromISODate(inv.issueDate) : null,
      dueDate: inv.dueDate ? fromISODate(inv.dueDate) : null,
      lastSeenAt: opts.now,
      // Resgate total encerra (mantendo a data original); voltar a ter saldo reabre.
      closedAt: closedNow ? (existing?.closedAt ?? opts.now) : null,
    };
    const row = await prisma.bankInvestment.upsert({
      where: key,
      create: { userId: conn.userId, connectionId: conn.id, providerInvestmentId: inv.id, ...data },
      update: data,
      select: { id: true },
    });
    if (!closedNow) {
      active++;
      const snap = { balanceCents: inv.balanceCents, investedCents: inv.investedCents, profitCents: inv.profitCents };
      await prisma.bankInvestmentSnapshot.upsert({
        where: { investmentId_snapshotDate: { investmentId: row.id, snapshotDate: today } },
        create: { userId: conn.userId, investmentId: row.id, snapshotDate: today, ...snap },
        update: snap,
      });
    }
  }

  // O que sumiu do banco é encerrado — mas só com uma leitura completa e não vazia. Lista vazia pode ser limite
  // mensal do Open Finance estourado (coleta parcial), e não prova que o usuário resgatou tudo.
  if (!opts.partial && list.length > 0) {
    await prisma.bankInvestment.updateMany({
      where: { userId: conn.userId, connectionId: conn.id, closedAt: null, providerInvestmentId: { notIn: list.map((i) => i.id) } },
      data: { closedAt: opts.now },
    });
  }
  return active;
}

// ---------------------------------------------------------------------------- consultas (sob RLS)

const investmentInclude = { connection: { select: { institutionName: true } } } satisfies Prisma.BankInvestmentInclude;
type InvestmentRow = Prisma.BankInvestmentGetPayload<{ include: typeof investmentInclude }>;

const dec = (v: { toNumber(): number } | null): number | null => (v === null ? null : v.toNumber());
const optCents = (v: bigint | null): number | null => (v === null ? null : num(v));

export function toInvestmentDTO(r: InvestmentRow): InvestmentDTO {
  const rate = dec(r.rate);
  const fixed = dec(r.fixedAnnualRate);
  const annual = dec(r.annualRate);
  const key = investmentGroupKey(r.type, r.subtype);
  const invested = optCents(r.investedCents);
  const profit = optCents(r.profitCents);
  return {
    id: r.id,
    connectionId: r.connectionId,
    institutionName: r.connection.institutionName,
    name: r.name,
    type: r.type,
    subtype: r.subtype,
    groupKey: key,
    groupLabel: investmentLabelPt(key),
    issuer: r.issuer,
    status: r.status as InvestmentDTO["status"],
    balanceCents: num(r.balanceCents),
    investedCents: invested,
    profitCents: profit,
    profitPct: profitPct(invested, profit),
    withdrawableCents: optCents(r.withdrawableCents),
    rateType: r.rateType,
    rate,
    fixedAnnualRate: fixed,
    annualRate: annual,
    rateLabel: investmentRateLabel({ rateType: r.rateType, rate, fixedAnnualRate: fixed, annualRate: annual }),
    issueDate: r.issueDate ? dateOut(r.issueDate) : null,
    dueDate: r.dueDate ? dateOut(r.dueDate) : null,
    updatedAt: tsOut(r.lastSeenAt),
    closed: r.closedAt !== null,
  };
}

/** Lista os investimentos com totais por produto. Por padrão só os ativos (não resgatados/encerrados). */
export async function listInvestments(tx: Tx, userId: string, opts: { includeClosed?: boolean } = {}): Promise<InvestmentsResponse> {
  const rows = await tx.bankInvestment.findMany({
    where: { userId, connection: { revokedAt: null }, ...(opts.includeClosed ? {} : { closedAt: null }) },
    include: investmentInclude,
    orderBy: [{ balanceCents: "desc" }, { name: "asc" }],
  });
  const items = rows.map(toInvestmentDTO);

  const open = items.filter((i) => !i.closed);
  const total = open.reduce((s, i) => s + i.balanceCents, 0);
  // Rendimento total só considera quem informa o valor investido (senão a % mentiria).
  const withBasis = open.filter((i) => i.investedCents !== null && i.profitCents !== null);
  const invested = withBasis.reduce((s, i) => s + (i.investedCents ?? 0), 0);
  const profit = withBasis.reduce((s, i) => s + (i.profitCents ?? 0), 0);

  const groups = new Map<string, { key: string; label: string; totalCents: number; count: number }>();
  for (const i of open) {
    const g = groups.get(i.groupKey) ?? { key: i.groupKey, label: i.groupLabel, totalCents: 0, count: 0 };
    g.totalCents += i.balanceCents;
    g.count++;
    groups.set(i.groupKey, g);
  }
  const latest = rows.reduce<Date | null>((m, r) => (m === null || r.lastSeenAt > m ? r.lastSeenAt : m), null);

  return {
    summary: {
      totalCents: total,
      investedCents: invested,
      profitCents: profit,
      profitPct: profitPct(invested, profit),
      count: open.length,
      updatedAt: latest ? tsOut(latest) : null,
    },
    groups: [...groups.values()].sort((a, b) => b.totalCents - a.totalCents),
    items,
  };
}

export async function getInvestmentDetail(tx: Tx, userId: string, id: string, now: Date): Promise<InvestmentDetailDTO> {
  const row = await tx.bankInvestment.findFirst({ where: { id, userId, connection: { revokedAt: null } }, include: investmentInclude });
  if (!row) throw Errors.notFound("Investimento");
  const since = fromISODate(addDays(toISODate(now), -HISTORY_DAYS));
  const snaps = await tx.bankInvestmentSnapshot.findMany({
    where: { userId, investmentId: row.id, snapshotDate: { gte: since } },
    orderBy: { snapshotDate: "asc" },
  });
  return {
    ...toInvestmentDTO(row),
    history: snaps.map((s) => ({ date: dateOut(s.snapshotDate), balanceCents: num(s.balanceCents), profitCents: optCents(s.profitCents) })),
  };
}

/** O que o banco informou sobre as contas e os cartões já vinculados (saldo, limite, fatura, vencimento). */
export async function bankOverview(tx: Tx, userId: string): Promise<BankOverviewDTO> {
  const links = await tx.bankConnectionAccount.findMany({
    where: { userId, connection: { revokedAt: null }, OR: [{ accountId: { not: null } }, { cardId: { not: null } }] },
    include: { connection: { select: { institutionName: true } } },
  });
  const accounts: BankOverviewDTO["accounts"] = [];
  const cards: BankOverviewDTO["cards"] = [];
  for (const l of links) {
    const updatedAt = l.providerDataAt ? tsOut(l.providerDataAt) : null;
    if (l.accountId) {
      accounts.push({ accountId: l.accountId, institutionName: l.connection.institutionName, balanceCents: optCents(l.balanceCents), updatedAt });
    } else if (l.cardId) {
      cards.push({ cardId: l.cardId, institutionName: l.connection.institutionName, updatedAt, ...cardBankData(l) });
    }
  }
  return { accounts, cards };
}

type CreditRow = {
  cardBrand: string | null;
  creditLimitCents: bigint | null;
  availableCreditCents: bigint | null;
  balanceCents: bigint | null;
  minimumPaymentCents: bigint | null;
  billCloseDate: Date | null;
  billDueDate: Date | null;
};

/** Dados do cartão como o banco informou; "em uso" = limite − disponível quando os dois são conhecidos. */
export function cardBankData(l: CreditRow) {
  const limit = optCents(l.creditLimitCents);
  const available = optCents(l.availableCreditCents);
  return {
    brand: l.cardBrand,
    limitCents: limit,
    availableCents: available,
    usedCents: limit !== null && available !== null ? Math.max(0, limit - available) : null,
    billCents: optCents(l.balanceCents),
    minimumPaymentCents: optCents(l.minimumPaymentCents),
    closeDate: l.billCloseDate ? dateOut(l.billCloseDate) : null,
    dueDate: l.billDueDate ? dateOut(l.billDueDate) : null,
  };
}

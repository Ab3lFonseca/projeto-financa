import {
  type ConnectToken,
  type OpenFinanceProvider,
  type ProviderAccount,
  type ProviderConnector,
  type ProviderInvestment,
  type ProviderItem,
  type ProviderTransaction,
} from "./provider";

/**
 * Provedor de DEMONSTRAÇÃO (somente desenvolvimento; a API recusa subir com ele em produção).
 *
 * Simula um banco do Open Finance com conta corrente, cartão de crédito e investimentos (CDB, caixinha,
 * porquinho, LCI, fundo) para você ver o fluxo completo sem contratar o Pluggy. Não guarda estado: tudo é
 * calculado a partir do relógio, então os dados "andam" com o tempo (transações novas a cada dia, CDB rendendo
 * conforme os dias passam, fatura e limite variando) — exatamente o que a atualização automática mostraria.
 *
 * Observação: identifica-se como "PLUGGY" porque o enum do banco só conhece esse provedor; os ids dos itens
 * de demonstração são derivados do usuário e nunca colidem com os do Pluggy real.
 */

/** Máscara fixa: o id do item = id do usuário embaralhado de forma reversível (sem guardar estado). */
const MASK = Uint8Array.from([0x5a, 0xc3, 0x91, 0x2e, 0x77, 0xd4, 0x0f, 0xa8, 0x13, 0x6b, 0xe2, 0x4d, 0x98, 0x35, 0xf1, 0x6c]);
MASK[6] = MASK[6]! & 0x0f; // preserva o nibble de versão do UUID
MASK[8] = MASK[8]! & 0x3f; // preserva os bits de variante

function xorUuid(uuid: string): string | null {
  const hex = uuid.replaceAll("-", "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  const bytes = Array.from({ length: 16 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16) ^ MASK[i]!);
  const h = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const demoItemIdFor = (userId: string): string => xorUuid(userId) ?? userId;
export const userIdFromDemoItem = (itemId: string): string | null => xorUuid(itemId);

// ---------------------------------------------------------------------------- dados simulados

/** PRNG determinístico (mulberry32): a mesma data gera sempre as mesmas transações. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = (h ^= h >>> 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDaysUTC = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const between = (r: () => number, lo: number, hi: number) => Math.round(lo + r() * (hi - lo));

type Template = { description: string; min: number; max: number; chance: number; direction: "DEBIT" | "CREDIT" };
const BANK_DAILY: Template[] = [
  { description: "MERCADO CENTRAL", min: 2_500, max: 18_000, chance: 0.22, direction: "DEBIT" },
  { description: "UBER *TRIP", min: 1_200, max: 4_500, chance: 0.2, direction: "DEBIT" },
  { description: "PADARIA PAO QUENTE", min: 800, max: 2_200, chance: 0.18, direction: "DEBIT" },
  { description: "IFOOD *RESTAURANTE", min: 2_900, max: 7_500, chance: 0.15, direction: "DEBIT" },
  { description: "FARMACIA SAO JOAO", min: 1_500, max: 9_000, chance: 0.08, direction: "DEBIT" },
  { description: "PIX ENVIADO MARIA", min: 5_000, max: 30_000, chance: 0.07, direction: "DEBIT" },
  { description: "PIX RECEBIDO JOAO", min: 10_000, max: 60_000, chance: 0.06, direction: "CREDIT" },
];
const CARD_DAILY: Template[] = [
  { description: "AMAZON MARKETPLACE", min: 3_000, max: 25_000, chance: 0.12, direction: "DEBIT" },
  { description: "POSTO SHELL", min: 15_000, max: 25_000, chance: 0.08, direction: "DEBIT" },
  { description: "RESTAURANTE SABOR", min: 4_500, max: 12_000, chance: 0.14, direction: "DEBIT" },
  { description: "MERCADO LIVRE", min: 5_000, max: 30_000, chance: 0.09, direction: "DEBIT" },
];

/**
 * Lançamentos fixos do mês (dia do mês → descrição/valor). O pagamento da fatura (`payment`) vale o total da
 * fatura que fechou dia 10, como num banco de verdade: sai da conta e entra no cartão no mesmo dia 17.
 */
type Monthly = { day: number; description: string; direction: "DEBIT" | "CREDIT"; cents: number | ((d: Date) => number); payment?: true };
const BANK_MONTHLY: Monthly[] = [
  { day: 5, description: "SALARIO EMPRESA XYZ", direction: "CREDIT", cents: 520_000 },
  { day: 5, description: "ENEL DISTRIBUICAO", direction: "DEBIT", cents: 16_790 },
  { day: 12, description: "NETFLIX.COM", direction: "DEBIT", cents: 3_990 },
  { day: 17, description: "PAGAMENTO FATURA CARTAO", direction: "DEBIT", cents: (d) => closedStatementTotal(d), payment: true },
];
const CARD_MONTHLY: Monthly[] = [
  { day: 8, description: "SPOTIFY", direction: "DEBIT", cents: 2_190 },
  { day: 17, description: "PAGAMENTO FATURA", direction: "CREDIT", cents: (d) => closedStatementTotal(d), payment: true },
];

const CHECKING = "demo-conta-corrente";
const CARD = "demo-cartao-gold";

/** Total das compras do cartão na fatura que fecha no dia 10 do mês de `d` (ciclo: dia 11 do mês anterior ao dia 10). */
function closedStatementTotal(d: Date): number {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 11));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 10));
  return transactionsFor(CARD, "CREDIT", start, end, true).reduce((sum, t) => sum + t.amountCents, 0);
}

function transactionsFor(accountId: string, kind: "BANK" | "CREDIT", from: Date, to: Date, purchasesOnly = false): ProviderTransaction[] {
  const daily = kind === "BANK" ? BANK_DAILY : CARD_DAILY;
  const monthly = (kind === "BANK" ? BANK_MONTHLY : CARD_MONTHLY).filter((m) => !(purchasesOnly && m.payment));
  const out: ProviderTransaction[] = [];
  for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())); d <= to; d = addDaysUTC(d, 1)) {
    const day = iso(d);
    const r = rng(`${accountId}:${day}`);
    let n = 0;
    for (const t of daily) {
      if (r() < t.chance) {
        out.push({ id: `${accountId}:${day}:${n++}`, accountId, description: t.description, amountCents: between(r, t.min, t.max), direction: t.direction, postedOn: day, status: "POSTED" });
      }
    }
    for (const m of monthly) {
      if (d.getUTCDate() !== m.day) continue;
      const cents = typeof m.cents === "function" ? m.cents(d) : m.cents;
      if (cents > 0) out.push({ id: `${accountId}:${day}:m${n++}`, accountId, description: m.description, amountCents: cents, direction: m.direction, postedOn: day, status: "POSTED" });
    }
  }
  return out.filter((t) => t.postedOn <= iso(to));
}

/** Rendimento composto: valor investido crescendo à taxa anual informada, pelos dias corridos desde a aplicação. */
function grow(investedCents: number, annualRate: number, issued: string, now: Date): number {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(`${issued}T00:00:00Z`).getTime()) / 86_400_000));
  return Math.round(investedCents * Math.pow(1 + annualRate, days / 365));
}

const CDI = 0.1065; // CDI fictício (10,65% a.a.) — só para a demonstração

function demoInvestments(now: Date): ProviderInvestment[] {
  type Spec = {
    id: string;
    name: string;
    type: string;
    subtype: string;
    issuer: string;
    investedCents: number;
    rateType: string | null;
    rate: number | null;
    /** Percentual do CDI (CDB, LCI...) ou rentabilidade anual em % (fundos). */
    pctCdi?: number;
    annual?: number;
    issueDate: string;
    dueDate: string | null;
    /** Liquidez diária: o valor todo pode ser resgatado agora. */
    liquid: boolean;
  };
  const make = (p: Spec): ProviderInvestment => {
    const rate = p.pctCdi !== undefined ? CDI * (p.pctCdi / 100) : (p.annual ?? 0) / 100;
    const balance = grow(p.investedCents, rate, p.issueDate, now);
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      subtype: p.subtype,
      issuer: p.issuer,
      status: "ACTIVE",
      balanceCents: balance,
      investedCents: p.investedCents,
      profitCents: balance - p.investedCents,
      withdrawableCents: p.liquid ? balance : null,
      rateType: p.rateType,
      rate: p.rate,
      fixedAnnualRate: null,
      annualRate: p.annual ?? null,
      issueDate: p.issueDate,
      dueDate: p.dueDate,
    };
  };
  return [
    make({ id: "demo-cdb-110", name: "CDB Banco Demo 110% CDI", type: "FIXED_INCOME", subtype: "CDB", issuer: "Banco Demo S.A.", investedCents: 500_000, rateType: "CDI", rate: 110, pctCdi: 110, issueDate: "2026-04-01", dueDate: "2028-04-01", liquid: false }),
    make({ id: "demo-caixinha", name: "Caixinha Viagem", type: "FIXED_INCOME", subtype: "CDB", issuer: "Banco Demo S.A.", investedCents: 120_000, rateType: "CDI", rate: 100, pctCdi: 100, issueDate: "2026-06-15", dueDate: null, liquid: true }),
    make({ id: "demo-porquinho", name: "Meu Porquinho", type: "FIXED_INCOME", subtype: "CDB", issuer: "Banco Demo S.A.", investedCents: 35_000, rateType: "CDI", rate: 100, pctCdi: 100, issueDate: "2026-08-20", dueDate: null, liquid: true }),
    make({ id: "demo-lci-94", name: "LCI Banco Demo 94% CDI", type: "FIXED_INCOME", subtype: "LCI", issuer: "Banco Demo S.A.", investedCents: 300_000, rateType: "CDI", rate: 94, pctCdi: 94, issueDate: "2026-02-10", dueDate: "2027-02-10", liquid: false }),
    make({ id: "demo-fundo-di", name: "Fundo DI Demo", type: "MUTUAL_FUND", subtype: "FIXED_INCOME_FUND", issuer: "Gestora Demo", investedCents: 80_000, rateType: null, rate: null, annual: 10.4, issueDate: "2026-03-01", dueDate: null, liquid: true }),
  ];
}

// ---------------------------------------------------------------------------- provedor

export class DemoOpenFinanceProvider implements OpenFinanceProvider {
  readonly name = "PLUGGY" as const;
  constructor(private readonly now: () => Date = () => new Date()) {}

  async listRegulatedConnectors(): Promise<ProviderConnector[]> {
    return [{ id: 9001, name: "Banco Demo (Open Finance)" }];
  }

  /** O token carrega o id do item de demonstração: o app o reconhece (`demo:`) e conecta sem abrir o widget. */
  async createConnectToken(input: { clientUserId: string; itemId?: string }): Promise<ConnectToken> {
    return { accessToken: `demo:${input.itemId ?? demoItemIdFor(input.clientUserId)}`, expiresAt: new Date(this.now().getTime() + 30 * 60_000) };
  }

  async getItem(itemId: string): Promise<ProviderItem | null> {
    const userId = userIdFromDemoItem(itemId);
    if (!userId) return null;
    const now = this.now();
    return {
      id: itemId,
      clientUserId: userId,
      institutionName: "Banco Demo",
      isOpenFinance: true,
      status: "ACTIVE",
      lastUpdatedAt: now,
      consentExpiresAt: addDaysUTC(now, 180),
      errorCode: null,
      partial: false,
    };
  }

  async listAccounts(_itemId: string): Promise<ProviderAccount[]> {
    const now = this.now();
    const dayIndex = Math.floor(now.getTime() / 86_400_000);
    // Devido hoje = compras ainda não pagas: antes do dia 17 inclui a fatura do mês anterior (que vence dia 17);
    // do dia 17 em diante o pagamento já saiu e só restam as compras do ciclo atual (a partir do dia 11).
    const owedFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (now.getUTCDate() < 17 ? 1 : 0), 11));
    const open = transactionsFor(CARD, "CREDIT", owedFrom, now, true).reduce((s, t) => s + t.amountCents, 0);
    const limit = 800_000;
    // Próximo fechamento (dia 10) e vencimento (dia 17).
    const closeMonth = now.getUTCDate() <= 10 ? now.getUTCMonth() : now.getUTCMonth() + 1;
    const close = new Date(Date.UTC(now.getUTCFullYear(), closeMonth, 10));
    const due = new Date(Date.UTC(now.getUTCFullYear(), closeMonth, 17));
    return [
      { id: CHECKING, kind: "BANK", name: "Conta Corrente", balanceCents: 420_000 + (dayIndex % 17) * 1_373, credit: null },
      {
        id: CARD,
        kind: "CREDIT",
        name: "Cartão Gold",
        balanceCents: open,
        credit: { brand: "MASTERCARD", limitCents: limit, availableCents: Math.max(0, limit - open - 120_000), closeDate: iso(close), dueDate: iso(due), minimumPaymentCents: Math.round(open * 0.15) },
      },
    ];
  }

  async listInvestments(_itemId: string): Promise<ProviderInvestment[]> {
    return demoInvestments(this.now());
  }

  async listTransactions(accountId: string, kind: "BANK" | "CREDIT", fromDate: string): Promise<ProviderTransaction[]> {
    return transactionsFor(accountId, kind, new Date(`${fromDate}T00:00:00Z`), this.now());
  }

  /** Na demonstração os dados já são sempre os mais recentes. */
  async refreshItem(): Promise<void> {}

  /** Sem estado no provedor: remover a conexão no app basta. */
  async deleteItem(): Promise<void> {}

  verifyWebhook(): boolean {
    return false;
  }
}

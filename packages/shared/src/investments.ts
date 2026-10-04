// Apresentação de investimentos vindos do Open Finance: agrupamento, nomes em português e rótulo de taxa.
// Regras puras (sem I/O), compartilhadas entre a API (agrupa os totais) e o app (mostra os rótulos).

/** Rótulos dos produtos mais comuns (chave = subtype do provedor ou, na falta, o type). */
const LABELS_PT: Record<string, string> = {
  CDB: "CDB",
  LCI: "LCI",
  LCA: "LCA",
  LC: "Letra de Câmbio",
  LIG: "LIG",
  LF: "Letra Financeira",
  CRI: "CRI",
  CRA: "CRA",
  DEBENTURES: "Debêntures",
  TREASURE: "Tesouro Direto",
  RETIREMENT: "Previdência",
  PGBL: "PGBL",
  VGBL: "VGBL",
  INVESTMENT_FUND: "Fundos de investimento",
  STOCK_FUND: "Fundos de ações",
  MULTIMARKET_FUND: "Fundos multimercado",
  EXCHANGE_FUND: "Fundos cambiais",
  FIXED_INCOME_FUND: "Fundos de renda fixa",
  FIP_FUND: "FIP",
  OFFSHORE_FUND: "Fundos no exterior",
  ETF_FUND: "ETFs",
  ETF: "ETFs",
  STOCK: "Ações",
  BDR: "BDRs",
  REAL_ESTATE_FUND: "Fundos imobiliários",
  DERIVATIVES: "Derivativos",
  OPTION: "Opções",
  COE: "COE",
  FIXED_INCOME: "Renda fixa",
  MUTUAL_FUND: "Fundos",
  EQUITY: "Renda variável",
  SECURITY: "Títulos e previdência",
  OTHER: "Outros",
};

/** "MULTIMARKET_FUND" → "Multimarket fund" (para tipos que ainda não conhecemos). */
function humanize(key: string): string {
  const text = key.toLowerCase().replaceAll("_", " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Chave de agrupamento: o produto específico (CDB, LCI...) quando informado; senão a categoria. */
export function investmentGroupKey(type: string, subtype: string | null | undefined): string {
  return (subtype && subtype.trim() ? subtype : type).trim().toUpperCase();
}

export function investmentLabelPt(key: string): string {
  return LABELS_PT[key.toUpperCase()] ?? humanize(key);
}

/** 98.5 → "98,5%" (sem depender de Intl, que varia entre Node, Hermes e navegadores). */
const fmtPct = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")}%`;

/**
 * Rótulo da taxa exatamente como o banco informou, em linguagem do dia a dia:
 *   CDI + taxa >= 50  → "110% do CDI"   (percentual do CDI)
 *   CDI + taxa < 50   → "CDI + 2% a.a."  (spread)
 *   pré-fixado        → "13,5% a.a."
 *   fundos            → "rentabilidade anual 11,2%"
 * Devolve null quando o banco não informou taxa. É informativo: a regra do contrato é a do banco.
 */
export function investmentRateLabel(i: {
  rateType?: string | null;
  rate?: number | null;
  fixedAnnualRate?: number | null;
  annualRate?: number | null;
}): string | null {
  const type = i.rateType?.trim().toUpperCase() || null;
  const rate = i.rate ?? null;
  if (type && rate !== null && type !== "PRE" && type !== "PRE_FIXADO") {
    if (type === "CDI") return rate >= 50 ? `${fmtPct(rate)} do CDI` : `CDI + ${fmtPct(rate)} a.a.`;
    return `${type} + ${fmtPct(rate)} a.a.`;
  }
  const fixed = i.fixedAnnualRate ?? (type && (type === "PRE" || type === "PRE_FIXADO") ? rate : null);
  if (fixed !== null && fixed !== undefined) return `${fmtPct(fixed)} a.a.`;
  if (i.annualRate !== null && i.annualRate !== undefined) return `rentabilidade anual ${fmtPct(i.annualRate)}`;
  return null;
}

/** Rendimento em % sobre o valor investido (null quando não dá para calcular). */
export function profitPct(investedCents: number | null | undefined, profitCents: number | null | undefined): number | null {
  if (!investedCents || investedCents <= 0 || profitCents === null || profitCents === undefined) return null;
  return Math.round((profitCents / investedCents) * 10_000) / 100;
}

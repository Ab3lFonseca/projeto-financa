import { monthNamePt, type ISODate } from "@app/shared";
import { formatPct } from "./format";

/** O último mês fechado, como o servidor manda (`dashboard.month.previousMonth`). */
export type ClosedMonth = { month: ISODate; incomeCents: number; expenseCents: number; leftoverCents: number; leftoverRatePct: number | null };

export type ClosedSavings = {
  /** Título do número ("Sobrou em setembro" ou, sem mês fechado, "Economia"). */
  label: string;
  /** O que sobrou do mês fechado; `null` quando não sobrou nada (ou não há mês fechado): o app mostra "—", nunca um valor inventado. */
  cents: number | null;
  /** Linha pequena embaixo do número. */
  hint: string;
  /** Frase para o saldo total ("em setembro você guardou 25% do que recebeu"); `null` quando não houve sobra. */
  summary: string | null;
};

/**
 * Economia só existe em MÊS FECHADO: sobrou dinheiro do mês passado inteiro. O que entra e sai no mês em andamento (um salário lançado hoje, por
 * exemplo) NUNCA vira "você economizou": o mês ainda não acabou. Resposta antiga do servidor (sem `previousMonth`) cai no mesmo caso "sem mês fechado".
 */
export function closedMonthSavings(prev: ClosedMonth | null | undefined): ClosedSavings {
  if (!prev) return { label: "Economia", cents: null, hint: "aparece quando um mês fecha", summary: null };
  const name = monthNamePt(prev.month);
  if (prev.leftoverCents > 0) {
    return {
      label: `Sobrou em ${name}`,
      cents: prev.leftoverCents,
      hint: prev.leftoverRatePct !== null ? `${formatPct(prev.leftoverRatePct)} do que recebeu` : "mês fechado",
      summary: prev.leftoverRatePct !== null ? `em ${name} você guardou ${formatPct(prev.leftoverRatePct)} do que recebeu` : null,
    };
  }
  return {
    label: `Sobrou em ${name}`,
    cents: null,
    hint: prev.leftoverCents < 0 ? "gastou a mais que recebeu" : "nada sobrou",
    summary: null,
  };
}

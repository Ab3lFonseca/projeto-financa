import { dateOfOccurrence, type ISODate, type RecurringKindName } from "@app/shared";
import type { api } from "@/lib/api/endpoints";

export type Freq = "WEEKLY" | "MONTHLY" | "YEARLY";
/** Como a recorrência termina: nunca, depois de N vezes ou numa data. */
export type EndMode = "never" | "times" | "date";

export type CreateRecurringInput = Parameters<typeof api.recurring.create>[0];

/** Limites do formulário (o servidor aceita um pouco mais: 60 períodos e 600 vezes). */
export const MAX_EVERY = 12;
export const MAX_TIMES = 120;

export const FREQ_LABEL: Record<Freq, string> = { WEEKLY: "Semanal", MONTHLY: "Mensal", YEARLY: "Anual" };
const UNIT: Record<Freq, [string, string]> = { WEEKLY: ["semana", "semanas"], MONTHLY: ["mês", "meses"], YEARLY: ["ano", "anos"] };

export const KIND_LABEL: Record<RecurringKindName, string> = { EXPENSE: "Despesa", INCOME: "Receita", TRANSFER: "Transferência" };

/** "Todo mês", "A cada 2 meses", "Toda semana", "Todo ano". */
export function cadenceText(frequency: Freq, every: number): string {
  const n = Math.max(1, Math.floor(every));
  const [one, many] = UNIT[frequency];
  if (n === 1) return frequency === "WEEKLY" ? "Toda semana" : `Todo ${one}`;
  return `A cada ${n} ${many}`;
}

/** "Sem data para acabar" ou "Termina em 05/12/2026". `dateText` formata a data (injetado para o texto ser testável). */
export function endText(endDate: ISODate | null, dateText: (iso: string) => string): string {
  return endDate ? `Termina em ${dateText(endDate)}` : "Sem data para acabar";
}

export type RecurringFormState = {
  type: RecurringKindName;
  description: string;
  amountCents: number | null;
  /** "acc:<id>" ou "card:<id>" (despesa/receita) ou "acc:<id>" da conta de origem (transferência). */
  source: string | null;
  /** Transferência: conta de destino. */
  toAccountId: string | null;
  categoryId: string | null;
  frequency: Freq;
  every: number;
  startDate: ISODate;
  endMode: EndMode;
  times: number;
  endDate: ISODate | null;
};

export const initialRecurringForm = (today: ISODate): RecurringFormState => ({
  type: "EXPENSE",
  description: "",
  amountCents: null,
  source: null,
  toAccountId: null,
  categoryId: null,
  frequency: "MONTHLY",
  every: 1,
  startDate: today,
  endMode: "never",
  times: 12,
  endDate: null,
});

const idOf = (source: string) => source.slice(source.indexOf(":") + 1);

/** Data da última ocorrência quando termina "depois de N vezes" (para mostrar antes de salvar); `null` nos outros modos. */
export function lastOccurrenceOf(s: RecurringFormState): ISODate | null {
  if (s.endMode !== "times") return null;
  return dateOfOccurrence({ frequency: s.frequency, intervalCount: s.every, startDate: s.startDate }, s.times);
}

/** Erros por campo (vazio = pode salvar). */
export function validateRecurringForm(s: RecurringFormState): Record<string, string> {
  const e: Record<string, string> = {};
  if (!s.description.trim()) e.description = s.type === "TRANSFER" ? "Descreva a transferência (ex.: Reserva mensal)." : "Descreva a conta (ex.: Aluguel).";
  if (!s.amountCents || s.amountCents <= 0) e.amount = "Informe o valor.";
  if (!s.source) e.source = s.type === "TRANSFER" ? "Escolha a conta de origem." : "Escolha a conta ou o cartão.";
  if (s.type === "TRANSFER") {
    if (!s.toAccountId) e.to = "Escolha a conta de destino.";
    else if (s.source && idOf(s.source) === s.toAccountId) e.to = "A origem e o destino devem ser contas diferentes.";
  }
  if (s.endMode === "date") {
    if (!s.endDate) e.end = "Escolha a data do fim.";
    else if (s.endDate < s.startDate) e.end = "O fim deve ser depois da primeira ocorrência.";
  }
  if (s.endMode === "times" && (s.times < 2 || s.times > MAX_TIMES)) e.end = `Informe de 2 a ${MAX_TIMES} vezes.`;
  return e;
}

/** Monta o pedido para a API a partir do formulário (já validado). */
export function buildRecurringBody(s: RecurringFormState): CreateRecurringInput {
  const isTransfer = s.type === "TRANSFER";
  const isCard = !isTransfer && !!s.source?.startsWith("card:");
  const sourceId = idOf(s.source!);
  return {
    type: s.type,
    description: s.description.trim(),
    amountCents: s.amountCents!,
    accountId: isCard ? null : sourceId,
    cardId: isCard ? sourceId : null,
    ...(isTransfer ? { toAccountId: s.toAccountId } : {}),
    categoryId: isTransfer ? null : s.categoryId,
    paymentMethod: isCard ? "CREDIT" : undefined,
    frequency: s.frequency,
    intervalCount: s.every,
    startDate: s.startDate,
    ...(s.endMode === "times" ? { occurrences: s.times } : {}),
    endDate: s.endMode === "date" ? s.endDate : null,
  };
}

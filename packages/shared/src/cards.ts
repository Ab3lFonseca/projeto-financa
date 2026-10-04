import { addMonths, dateInMonth, startOfMonth, type ISODate } from "./dates";

export type InvoiceCycle = {
  /** Último dia em que compras entram nesta fatura. */
  closingDate: ISODate;
  dueDate: ISODate;
  /** Primeiro dia do mês do VENCIMENTO. É o rótulo da fatura ("fatura de novembro"). */
  referenceMonth: ISODate;
};

/**
 * Descobre a fatura de uma compra.
 *
 * Regras (documentadas em docs/database.md):
 *  - compra feita até o dia do fechamento (inclusive) entra na fatura que fecha naquele mês;
 *    depois do fechamento, entra na fatura do mês seguinte;
 *  - dias 29–31 em meses curtos usam o último dia do mês;
 *  - se o dia de vencimento é maior que o de fechamento, vence no mesmo mês do fechamento;
 *    caso contrário, vence no mês seguinte;
 *  - o rótulo (`referenceMonth`) é o mês do vencimento.
 */
export function invoiceCycleFor(purchaseDate: ISODate, closingDay: number, dueDay: number): InvoiceCycle {
  const closingThisMonth = dateInMonth(purchaseDate, closingDay);
  const closingDate =
    purchaseDate <= closingThisMonth
      ? closingThisMonth
      : dateInMonth(addMonths(startOfMonth(purchaseDate), 1), closingDay);

  const dueBase = dueDay > closingDay ? closingDate : addMonths(startOfMonth(closingDate), 1);
  const dueDate = dateInMonth(dueBase, dueDay);

  return { closingDate, dueDate, referenceMonth: startOfMonth(dueDate) };
}

export type InvoiceStatusValue = "OPEN" | "CLOSED" | "PAID";

/**
 * Status "de verdade" da fatura, derivado dos dados (não depende de job ter rodado):
 *  PAID   → total > 0 e pagamentos cobrem o total (ou total = 0 e já fechada)
 *  CLOSED → passou a data de fechamento
 *  OPEN   → ainda recebendo compras
 */
export function deriveInvoiceStatus(args: {
  closingDate: ISODate;
  totalCents: number;
  paidCents: number;
  today: ISODate;
}): InvoiceStatusValue {
  const { closingDate, totalCents, paidCents, today } = args;
  const closed = today > closingDate;
  if (totalCents > 0 && paidCents >= totalCents) return "PAID";
  if (totalCents <= 0 && closed) return "PAID";
  return closed ? "CLOSED" : "OPEN";
}

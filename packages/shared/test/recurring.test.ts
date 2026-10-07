import { describe, expect, it } from "vitest";
import { createRecurringBody, dateOfOccurrence, nextOccurrence, occurrencesBetween } from "../src";

const A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const B = "1f8fad5b-d9cb-469f-a165-70867728950e";
const CARD = "2f8fad5b-d9cb-469f-a165-70867728950e";
const CAT = "3f8fad5b-d9cb-469f-a165-70867728950e";

const base = { type: "EXPENSE" as const, description: "Aluguel", amountCents: 100_000, accountId: A, frequency: "MONTHLY" as const, startDate: "2026-10-05" };
const transfer = { type: "TRANSFER" as const, description: "Reserva", amountCents: 20_000, accountId: A, toAccountId: B, frequency: "MONTHLY" as const, startDate: "2026-10-05" };

describe("recorrência: data do fim por número de vezes", () => {
  it("a primeira ocorrência conta como 1", () => {
    const rule = { frequency: "MONTHLY" as const, intervalCount: 1, startDate: "2026-10-05" as const };
    expect(dateOfOccurrence(rule, 1)).toBe("2026-10-05");
    expect(dateOfOccurrence(rule, 2)).toBe("2026-11-05");
    expect(dateOfOccurrence(rule, 12)).toBe("2027-09-05");
  });
  it("respeita o intervalo (a cada 2 meses, a cada 2 semanas, anual)", () => {
    expect(dateOfOccurrence({ frequency: "MONTHLY", intervalCount: 2, startDate: "2026-10-05" }, 3)).toBe("2027-02-05");
    expect(dateOfOccurrence({ frequency: "WEEKLY", intervalCount: 2, startDate: "2026-10-05" }, 3)).toBe("2026-11-02");
    expect(dateOfOccurrence({ frequency: "YEARLY", intervalCount: 1, startDate: "2026-10-05" }, 3)).toBe("2028-10-05");
  });
  it("dia 31 ancorado: janeiro vira fevereiro curto e volta ao 31", () => {
    const rule = { frequency: "MONTHLY" as const, intervalCount: 1, dayOfMonth: 31, startDate: "2027-01-31" as const };
    expect(dateOfOccurrence(rule, 2)).toBe("2027-02-28");
    expect(dateOfOccurrence(rule, 3)).toBe("2027-03-31");
  });
  it("a data calculada é mesmo a última ocorrência gerada e a seguinte não existe", () => {
    const rule = { frequency: "MONTHLY" as const, intervalCount: 1, startDate: "2026-10-05" as const };
    const end = dateOfOccurrence(rule, 6);
    const all = occurrencesBetween({ ...rule, endDate: end }, rule.startDate, "2030-01-01");
    expect(all).toHaveLength(6);
    expect(all.at(-1)).toBe(end);
    expect(nextOccurrence({ ...rule, endDate: end }, end)).toBeNull();
  });
  it("valores menores que 1 valem 1", () => {
    expect(dateOfOccurrence({ frequency: "MONTHLY", intervalCount: 1, startDate: "2026-10-05" }, 0)).toBe("2026-10-05");
  });
});

describe("recorrência: pedido de criação", () => {
  it("despesa e receita seguem como antes", () => {
    expect(createRecurringBody.safeParse(base).success).toBe(true);
    expect(createRecurringBody.safeParse({ ...base, type: "INCOME" }).success).toBe(true);
    expect(createRecurringBody.safeParse({ ...base, accountId: undefined, cardId: CARD }).success).toBe(true);
    expect(createRecurringBody.safeParse({ ...base, cardId: CARD }).success).toBe(false); // conta E cartão
    expect(createRecurringBody.safeParse({ ...base, accountId: undefined }).success).toBe(false); // nenhum
  });

  it("transferência: precisa de origem e destino diferentes, sem cartão, categoria nem forma de pagamento", () => {
    expect(createRecurringBody.safeParse(transfer).success).toBe(true);
    expect(createRecurringBody.safeParse({ ...transfer, toAccountId: undefined }).success).toBe(false);
    expect(createRecurringBody.safeParse({ ...transfer, accountId: undefined }).success).toBe(false);
    expect(createRecurringBody.safeParse({ ...transfer, toAccountId: A }).success).toBe(false);
    expect(createRecurringBody.safeParse({ ...transfer, cardId: CARD }).success).toBe(false);
    expect(createRecurringBody.safeParse({ ...transfer, categoryId: CAT }).success).toBe(false);
    expect(createRecurringBody.safeParse({ ...transfer, paymentMethod: "PIX" }).success).toBe(false);
  });

  it("a conta de destino só existe em transferência", () => {
    expect(createRecurringBody.safeParse({ ...base, toAccountId: B }).success).toBe(false);
    expect(createRecurringBody.safeParse({ ...base, type: "INCOME", toAccountId: B }).success).toBe(false);
  });

  it("fim: por data ou por número de vezes (nunca os dois), com limites", () => {
    expect(createRecurringBody.safeParse({ ...base, occurrences: 12 }).success).toBe(true);
    expect(createRecurringBody.safeParse({ ...base, endDate: "2027-10-05" }).success).toBe(true);
    expect(createRecurringBody.safeParse({ ...base, occurrences: 12, endDate: "2027-10-05" }).success).toBe(false);
    expect(createRecurringBody.safeParse({ ...base, occurrences: 1 }).success).toBe(false);
    expect(createRecurringBody.safeParse({ ...base, occurrences: 601 }).success).toBe(false);
    expect(createRecurringBody.safeParse({ ...base, endDate: "2026-10-04" }).success).toBe(false); // antes do início
    expect(createRecurringBody.safeParse({ ...base, occurrences: 2.5 }).success).toBe(false);
  });

  it("a cada N períodos: de 1 a 60", () => {
    expect(createRecurringBody.safeParse({ ...base, intervalCount: 3 }).success).toBe(true);
    expect(createRecurringBody.parse(base).intervalCount).toBe(1);
    expect(createRecurringBody.safeParse({ ...base, intervalCount: 0 }).success).toBe(false);
    expect(createRecurringBody.safeParse({ ...base, intervalCount: 61 }).success).toBe(false);
  });

  it("campos desconhecidos são recusados", () => {
    expect(createRecurringBody.safeParse({ ...base, parcelas: 3 }).success).toBe(false);
  });
});

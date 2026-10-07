import { createRecurringBody } from "@app/shared";
import { describe, expect, it } from "vitest";
import { buildRecurringBody, cadenceText, endText, initialRecurringForm, lastOccurrenceOf, validateRecurringForm, type RecurringFormState } from "./recurring";

const A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const B = "1f8fad5b-d9cb-469f-a165-70867728950e";
const CARD = "2f8fad5b-d9cb-469f-a165-70867728950e";
const TODAY = "2026-10-04" as const;

const form = (over: Partial<RecurringFormState> = {}): RecurringFormState => ({ ...initialRecurringForm(TODAY), description: "Aluguel", amountCents: 150_000, source: `acc:${A}`, ...over });

describe("textos da recorrência", () => {
  it("cadência: todo mês, a cada N meses, semana e ano", () => {
    expect(cadenceText("MONTHLY", 1)).toBe("Todo mês");
    expect(cadenceText("MONTHLY", 2)).toBe("A cada 2 meses");
    expect(cadenceText("WEEKLY", 1)).toBe("Toda semana");
    expect(cadenceText("WEEKLY", 3)).toBe("A cada 3 semanas");
    expect(cadenceText("YEARLY", 1)).toBe("Todo ano");
    expect(cadenceText("YEARLY", 2)).toBe("A cada 2 anos");
    expect(cadenceText("MONTHLY", 0)).toBe("Todo mês"); // nunca menos que 1
  });
  it("fim: sem data ou a data formatada", () => {
    expect(endText(null, (d) => d)).toBe("Sem data para acabar");
    expect(endText("2027-01-05", (d) => `<${d}>`)).toBe("Termina em <2027-01-05>");
  });
});

describe("formulário de recorrência", () => {
  it("começa como despesa mensal, a cada 1, sem fim, hoje", () => {
    expect(initialRecurringForm(TODAY)).toMatchObject({ type: "EXPENSE", frequency: "MONTHLY", every: 1, endMode: "never", startDate: TODAY, endDate: null });
  });

  it("valida o básico", () => {
    expect(validateRecurringForm(form())).toEqual({});
    expect(Object.keys(validateRecurringForm(form({ description: " ", amountCents: null, source: null })))).toEqual(["description", "amount", "source"]);
  });

  it("transferência pede origem e destino diferentes", () => {
    const t = form({ type: "TRANSFER", description: "Reserva" });
    expect(validateRecurringForm(t).to).toMatch(/destino/);
    expect(validateRecurringForm({ ...t, toAccountId: A }).to).toMatch(/diferentes/);
    expect(validateRecurringForm({ ...t, toAccountId: B })).toEqual({});
  });

  it("fim por data: precisa de data, e depois do início", () => {
    expect(validateRecurringForm(form({ endMode: "date" })).end).toMatch(/Escolha/);
    expect(validateRecurringForm(form({ endMode: "date", endDate: "2026-09-01" })).end).toMatch(/depois/);
    expect(validateRecurringForm(form({ endMode: "date", endDate: "2027-01-01" }))).toEqual({});
  });

  it("fim por vezes: de 2 a 120", () => {
    expect(validateRecurringForm(form({ endMode: "times", times: 1 })).end).toMatch(/2 a 120/);
    expect(validateRecurringForm(form({ endMode: "times", times: 121 })).end).toMatch(/2 a 120/);
    expect(validateRecurringForm(form({ endMode: "times", times: 12 }))).toEqual({});
  });

  it("mostra a data da última ocorrência quando termina depois de N vezes", () => {
    expect(lastOccurrenceOf(form({ endMode: "times", times: 12, startDate: "2026-10-05" }))).toBe("2027-09-05");
    expect(lastOccurrenceOf(form({ endMode: "times", times: 3, every: 2, startDate: "2026-10-05" }))).toBe("2027-02-05");
    expect(lastOccurrenceOf(form({ endMode: "never" }))).toBeNull();
    expect(lastOccurrenceOf(form({ endMode: "date", endDate: "2027-01-01" }))).toBeNull();
  });
});

describe("pedido enviado à API", () => {
  // o que o app monta tem que passar no contrato que o servidor aplica
  const accepted = (s: RecurringFormState) => createRecurringBody.safeParse(buildRecurringBody(s));

  it("despesa na conta, sem fim", () => {
    const body = buildRecurringBody(form());
    expect(body).toMatchObject({ type: "EXPENSE", accountId: A, cardId: null, categoryId: null, frequency: "MONTHLY", intervalCount: 1, endDate: null });
    expect(body).not.toHaveProperty("occurrences");
    expect(accepted(form()).success).toBe(true);
  });

  it("despesa no cartão usa Crédito", () => {
    const s = form({ source: `card:${CARD}` });
    expect(buildRecurringBody(s)).toMatchObject({ accountId: null, cardId: CARD, paymentMethod: "CREDIT" });
    expect(accepted(s).success).toBe(true);
  });

  it("receita com categoria", () => {
    const s = form({ type: "INCOME", description: "Salário", categoryId: B });
    expect(buildRecurringBody(s)).toMatchObject({ type: "INCOME", categoryId: B });
    expect(accepted(s).success).toBe(true);
  });

  it("transferência: origem, destino, sem categoria nem cartão", () => {
    const s = form({ type: "TRANSFER", description: "Reserva", toAccountId: B, categoryId: CARD });
    const body = buildRecurringBody(s);
    expect(body).toMatchObject({ type: "TRANSFER", accountId: A, toAccountId: B, cardId: null, categoryId: null });
    expect(accepted(s).success).toBe(true);
  });

  it("a cada N, depois de N vezes e em uma data", () => {
    const times = buildRecurringBody(form({ every: 2, endMode: "times", times: 6 }));
    expect(times).toMatchObject({ intervalCount: 2, occurrences: 6, endDate: null });
    expect(accepted(form({ every: 2, endMode: "times", times: 6 })).success).toBe(true);

    const date = buildRecurringBody(form({ endMode: "date", endDate: "2027-03-01" }));
    expect(date).toMatchObject({ endDate: "2027-03-01" });
    expect(date).not.toHaveProperty("occurrences");
    expect(accepted(form({ endMode: "date", endDate: "2027-03-01" })).success).toBe(true);
  });

  it("nunca manda fim por data e por vezes juntos (mesmo que o formulário guarde os dois)", () => {
    const s = form({ endMode: "times", times: 4, endDate: "2027-03-01" });
    const body = buildRecurringBody(s);
    expect(body.endDate).toBeNull();
    expect(accepted(s).success).toBe(true);
  });
});

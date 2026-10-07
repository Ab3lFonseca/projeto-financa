import { describe, expect, it } from "vitest";
import { adminSuggestionsQuery, createSuggestionBody, decideSuggestionBody, SUGGESTION_MAX, SUGGESTION_MIN, SUGGESTION_STATUS_LABEL, SUGGESTIONS_PER_DAY, suggestionStatuses } from "../src";

describe("sugestões: contrato", () => {
  it("o texto vai de 10 a 1.000 caracteres, já limpo (espaços e controles)", () => {
    expect(SUGGESTION_MIN).toBe(10);
    expect(SUGGESTION_MAX).toBe(1000);
    expect(SUGGESTIONS_PER_DAY).toBe(5);
    expect(createSuggestionBody.safeParse({ body: "123456789" }).success).toBe(false);
    expect(createSuggestionBody.safeParse({ body: "1234567890" }).success).toBe(true);
    expect(createSuggestionBody.safeParse({ body: "a".repeat(1000) }).success).toBe(true);
    expect(createSuggestionBody.safeParse({ body: "a".repeat(1001) }).success).toBe(false);
    expect(createSuggestionBody.safeParse({ body: "    curto    " }).success).toBe(false);
    expect(createSuggestionBody.parse({ body: "  linha 1\r\nlinha 2\u0000 aqui  " }).body).toBe("linha 1\nlinha 2 aqui");
  });

  it("o pedido não aceita campos extras (ninguém envia a própria situação)", () => {
    expect(createSuggestionBody.safeParse({ body: "uma sugestão válida", status: "APPROVED" }).success).toBe(false);
    expect(createSuggestionBody.safeParse({}).success).toBe(false);
  });

  it("três situações: em análise (branco), válida (verde) e não válida (vermelho)", () => {
    expect([...suggestionStatuses]).toEqual(["PENDING", "APPROVED", "REJECTED"]);
    expect(SUGGESTION_STATUS_LABEL.APPROVED.color).toBe("green");
    expect(SUGGESTION_STATUS_LABEL.REJECTED.color).toBe("red");
    expect(SUGGESTION_STATUS_LABEL.PENDING.color).toBe("white");
    expect(new Set(Object.values(SUGGESTION_STATUS_LABEL).map((l) => l.color)).size).toBe(3);
  });

  it("a decisão aceita só uma das três situações, com recado opcional de até 500 caracteres, e nada além disso", () => {
    expect(decideSuggestionBody.safeParse({ status: "APPROVED" }).success).toBe(true);
    expect(decideSuggestionBody.safeParse({ status: "REJECTED", note: "Fora do escopo agora." }).success).toBe(true);
    expect(decideSuggestionBody.safeParse({ status: "PENDING", note: null }).success).toBe(true);
    expect(decideSuggestionBody.safeParse({ status: "TALVEZ" }).success).toBe(false);
    expect(decideSuggestionBody.safeParse({ status: "APPROVED", note: "x".repeat(501) }).success).toBe(false);
    expect(decideSuggestionBody.safeParse({ status: "APPROVED", body: "outro texto" }).success).toBe(false);
  });

  it("a consulta do quadro: situação opcional e limite de 1 a 100 (padrão 50)", () => {
    expect(adminSuggestionsQuery.parse({})).toEqual({ limit: 50 });
    expect(adminSuggestionsQuery.parse({ status: "APPROVED", limit: "100" })).toEqual({ status: "APPROVED", limit: 100 });
    expect(adminSuggestionsQuery.safeParse({ limit: "0" }).success).toBe(false);
    expect(adminSuggestionsQuery.safeParse({ limit: "101" }).success).toBe(false);
    expect(adminSuggestionsQuery.safeParse({ status: "OUTRA" }).success).toBe(false);
  });
});

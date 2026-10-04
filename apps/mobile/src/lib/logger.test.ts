import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
  },
}));

import { flushLogsToStorage, formatLogText, installGlobalErrorHandlers, log, MAX_ENTRIES, scrub, setCurrentScreen, useLogStore } from "./logger";

const entries = () => useLogStore.getState().entries;

beforeEach(() => {
  store.clear();
  setCurrentScreen(undefined);
  useLogStore.setState({ entries: [], reportsEnabled: true, loaded: false });
});

describe("higienização", () => {
  it("remove e-mail, token, valores em reais e números longos", () => {
    expect(scrub("ana@exemplo.com pagou R$ 1.234,56 (cartão 4111111111111111) Bearer abcdefghij1234567890")).toBe(
      "[email] pagou R$ [valor] (cartão [numero]) Bearer [token]",
    );
    expect(scrub("TypeError: undefined is not a function")).toBe("TypeError: undefined is not a function");
  });

  it("aplica na mensagem, na pilha e no contexto de cada evento", () => {
    setCurrentScreen("/transaction/new");
    log.error("js", new Error("falha com ana@exemplo.com"), { cpf: "12345678901", ok: true, n: 3 });
    const [e] = entries();
    expect(e).toMatchObject({ level: "error", source: "js", screen: "/transaction/new", count: 1, sent: false });
    expect(e!.message).toBe("Error: falha com [email]");
    expect(e!.stack).not.toContain("ana@exemplo.com");
    expect(e!.context).toEqual({ cpf: "[numero]", ok: true, n: 3 });
  });
});

describe("buffer", () => {
  it("junta repetições seguidas do mesmo evento em vez de encher o registro", () => {
    for (let i = 0; i < 5; i++) log.error("render", "tela quebrou");
    log.warn("api", "GET /x → 503 INTERNAL");
    log.error("render", "tela quebrou");
    expect(entries().map((e) => [e.source, e.count])).toEqual([["render", 5], ["api", 1], ["render", 1]]);
  });

  it(`guarda no máximo ${MAX_ENTRIES} eventos (descarta os mais antigos)`, () => {
    for (let i = 0; i < MAX_ENTRIES + 25; i++) log.info("t", `evento ${i}`);
    expect(entries()).toHaveLength(MAX_ENTRIES);
    expect(entries()[0]!.message).toBe("evento 25");
    expect(entries().at(-1)!.message).toBe(`evento ${MAX_ENTRIES + 24}`);
  });

  it("limita o tamanho de mensagem, pilha e contexto", () => {
    const err = new Error("m".repeat(900));
    err.stack = "s".repeat(9000);
    const context = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, "v".repeat(500)]));
    log.error("js", err, context);
    const [e] = entries();
    expect(e!.message.length).toBe(500);
    expect(e!.stack!.length).toBe(4000);
    expect(Object.keys(e!.context!)).toHaveLength(12);
    expect(e!.context!.k0!.toString().length).toBe(200);
  });

  it("aceita qualquer coisa como mensagem (objeto, null, ciclo)", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    log.error("x", { a: 1 });
    log.error("x", null);
    log.error("x", cyclic);
    expect(entries().map((e) => e.message)).toEqual(['{"a":1}', "null", "[object Object]"]);
  });

  it("marca como enviados e limpa", () => {
    log.error("a", "um");
    log.error("b", "dois");
    useLogStore.getState().markSent([entries()[0]!.id]);
    expect(entries().map((e) => e.sent)).toEqual([true, false]);
    useLogStore.getState().clear();
    expect(entries()).toEqual([]);
  });
});

describe("persistência", () => {
  it("grava e recupera, mesclando com o que aconteceu antes do carregamento", async () => {
    log.error("js", "antigo");
    useLogStore.getState().setReportsEnabled(false);
    await flushLogsToStorage();
    expect(JSON.parse(store.get("app-log-v1")!).entries).toHaveLength(1);

    // "reabre o app": estado em memória zerado, mas já com um erro novo antes do load terminar
    useLogStore.setState({ entries: [], reportsEnabled: true, loaded: false });
    log.error("js", "novo");
    await useLogStore.getState().load();
    expect(entries().map((e) => e.message)).toEqual(["antigo", "novo"]);
    expect(useLogStore.getState().reportsEnabled).toBe(false);
    expect(useLogStore.getState().loaded).toBe(true);
  });

  it("armazenamento corrompido não quebra o app", async () => {
    store.set("app-log-v1", "{não é json");
    await expect(useLogStore.getState().load()).resolves.toBeUndefined();
    expect(useLogStore.getState().loaded).toBe(true);
  });
});

describe("captura global", () => {
  it("console.error vira evento, sem laço infinito, e o comportamento original é mantido", () => {
    const original = console.error;
    const spy = vi.fn();
    console.error = spy;
    try {
      installGlobalErrorHandlers();
      installGlobalErrorHandlers(); // idempotente
      console.error("algo falhou", new Error("boom"), { a: 1 });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(entries()).toHaveLength(1);
      expect(entries()[0]).toMatchObject({ level: "error", source: "console" });
      expect(entries()[0]!.message).toBe('algo falhou Error: boom {"a":1}');
    } finally {
      console.error = original;
    }
  });
});

describe("texto para compartilhar", () => {
  it("cabeçalho + eventos com hora, origem, tela, repetições, contexto e pilha", () => {
    setCurrentScreen("/home");
    log.error("render", new Error("quebrou"), { fatal: false });
    log.error("render", new Error("quebrou"));
    const text = formatLogText(entries(), { app: "0.1.0", plataforma: "android 14" });
    expect(text.startsWith("# Diagnóstico do app Finança\n# app: 0.1.0\n# plataforma: android 14\n\n")).toBe(true);
    expect(text).toMatch(/\[\d{4}-\d{2}-\d{2} [\d:]+Z\] ERROR render \(\/home\) ×2: Error: quebrou/);
    expect(text).toContain('    contexto: {"fatal":false}');
    expect(text.endsWith("\n")).toBe(true);
  });
});

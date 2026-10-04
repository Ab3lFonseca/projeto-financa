import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLogSinks, DailyLogFile } from "../src/lib/log-files";
import { scrub } from "../src/modules/diagnostics/routes";
import { createTestEnv, type TestEnv } from "./helpers/env";
import { createWorld } from "./helpers/factories";

const tmp = () => mkdtempSync(join(tmpdir(), "financa-log-"));
const today = () => new Date().toLocaleDateString("sv-SE");

describe("arquivo de log diário", () => {
  it("grava em <prefixo>-<dia>.log e troca de arquivo quando o dia vira", () => {
    const dir = tmp();
    let now = new Date("2026-10-04T12:00:00");
    const log = new DailyLogFile(dir, "api", 30, () => now);
    log.write("linha 1\n");
    now = new Date("2026-10-05T00:10:00");
    log.write("linha 2\n");
    return log.close().then(() => {
      expect(readdirSync(dir).sort()).toEqual(["api-2026-10-04.log", "api-2026-10-05.log"]);
      expect(readFileSync(join(dir, "api-2026-10-04.log"), "utf8")).toBe("linha 1\n");
      expect(readFileSync(join(dir, "api-2026-10-05.log"), "utf8")).toBe("linha 2\n");
      rmSync(dir, { recursive: true, force: true });
    });
  });

  it("apaga só os arquivos antigos do próprio prefixo (retenção)", () => {
    const dir = tmp();
    for (const f of ["api-2026-08-01.log", "api-2026-09-20.log", "api-2026-10-03.log", "errors-2026-08-01.log", "outro.txt", "api-nao-e-data.log"]) {
      writeFileSync(join(dir, f), "x");
    }
    const log = new DailyLogFile(dir, "api", 30, () => new Date("2026-10-04T12:00:00"));
    // 2026-10-04 − 30 dias = 2026-09-04: só api-2026-08-01 sai
    expect(readdirSync(dir).sort()).toEqual(["api-2026-09-20.log", "api-2026-10-03.log", "api-nao-e-data.log", "errors-2026-08-01.log", "outro.txt"]);
    expect(log.prune()).toBe(0);
    return log.close().then(() => rmSync(dir, { recursive: true, force: true }));
  });

  it("nunca derruba a aplicação se o disco falhar", () => {
    const dir = tmp();
    const blocker = join(dir, "arquivo");
    writeFileSync(blocker, "x"); // um ARQUIVO no lugar da pasta: mkdir falha
    const log = new DailyLogFile(join(blocker, "logs"), "api", 30);
    expect(() => log.write("não deve estourar\n")).not.toThrow();
    expect(log.prune()).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("destinos do log", () => {
  it("tudo vai para o console e para api-*.log; só warn/error/fatal vão também para errors-*.log", async () => {
    const dir = tmp();
    const shown: string[] = [];
    const sinks = createLogSinks({ dir, retentionDays: 7, console: { write: (l) => void shown.push(l) } });
    const line = (level: number, msg: string) => `{"level":${level},"msg":"${msg}"}\n`;
    for (const [lvl, msg] of [[30, "info"], [40, "warn"], [50, "error"], [60, "fatal"]] as const) sinks.stream.write(line(lvl, msg));
    await sinks.close();
    expect(shown).toHaveLength(4);
    const all = readFileSync(join(dir, `api-${today()}.log`), "utf8").trim().split("\n");
    const errs = readFileSync(join(dir, `errors-${today()}.log`), "utf8").trim().split("\n");
    expect(all).toHaveLength(4);
    expect(errs.map((l) => JSON.parse(l).msg)).toEqual(["warn", "error", "fatal"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("sem pasta configurada só usa o console", async () => {
    const shown: string[] = [];
    const sinks = createLogSinks({ retentionDays: 7, console: { write: (l) => void shown.push(l) } });
    sinks.stream.write('{"level":50,"msg":"x"}\n');
    await sinks.close();
    expect(shown).toHaveLength(1);
  });
});

describe("higienização de texto livre", () => {
  it("remove e-mail, token, valores em reais e números longos", () => {
    const out = scrub("falhou para ana@exemplo.com.br com Bearer abcdefghij1234567890 em R$ 1.234,56 cpf 12345678901");
    expect(out).toBe("falhou para [email] com Bearer [token] em R$ [valor] cpf [numero]");
    expect(scrub("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123")).toBe("[token]");
    expect(scrub("TypeError: x is undefined at Home (index.tsx:42)")).toBe("TypeError: x is undefined at Home (index.tsx:42)");
  });
});

describe("relatórios de erro do app (POST /v1/diagnostics/client-errors)", () => {
  let env: TestEnv;
  let dir: string;
  beforeAll(async () => {
    dir = tmp();
    mkdirSync(dir, { recursive: true });
    process.env.TEST_LOG = "1"; // por padrão o log é silencioso em testes
    env = await createTestEnv({ LOG_DIR: dir, LOG_LEVEL: "info" });
  });
  afterAll(async () => {
    await env.close();
    delete process.env.TEST_LOG;
    rmSync(dir, { recursive: true, force: true });
  });

  const report = (events: unknown[]) => ({ app: { version: "0.1.0", platform: "android", osVersion: "14" }, events });
  const event = (over: Record<string, unknown> = {}) => ({ at: "2026-10-04T12:00:00.000Z", level: "error", source: "js", message: "boom", ...over });

  it("exige login", async () => {
    expect((await env.anon.post("/v1/diagnostics/client-errors", report([event()]))).status).toBe(401);
  });

  it("aceita relatório mesmo sem o aceite dos termos (erro na tela de consentimento também conta)", async () => {
    const u = await env.newUser({ consent: false });
    const res = await u.post("/v1/diagnostics/client-errors", report([event(), event({ level: "warn", source: "api" })]));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: 2 });
  });

  it("valida o formato: vazio, grande demais e campo desconhecido são recusados", async () => {
    const u = await env.newUser();
    expect((await u.post("/v1/diagnostics/client-errors", report([]))).status).toBe(422);
    expect((await u.post("/v1/diagnostics/client-errors", report(Array.from({ length: 21 }, () => event())))).status).toBe(422);
    expect((await u.post("/v1/diagnostics/client-errors", report([event({ message: "x".repeat(501) })]))).status).toBe(422);
    expect((await u.post("/v1/diagnostics/client-errors", report([event({ level: "debug" })]))).status).toBe(422);
    expect((await u.post("/v1/diagnostics/client-errors", { ...report([event()]), extra: 1 })).status).toBe(422);
  });

  it("grava no log do servidor com origem client, id do usuário e sem dados sensíveis", async () => {
    const w = await createWorld(env);
    await w.user.post("/v1/diagnostics/client-errors", report([
      event({ message: "falha ao salvar R$ 99,90 para ana@exemplo.com", stack: "Error: x\n at Bearer abcdefghij1234567890", screen: "/transaction/new", context: { campo: "12345678901234", ok: true } }),
    ]));
    await w.user.get("/v1/accounts/00000000-0000-4000-8000-000000000000"); // 404: recusa registrada com o código
    await env.anon.get("/v1/accounts"); // 401

    await env.app.close?.(); // garante a gravação dos arquivos
    const all = readFileSync(join(dir, `api-${today()}.log`), "utf8");
    const errs = readFileSync(join(dir, `errors-${today()}.log`), "utf8");
    const lines = all.trim().split("\n").map((l) => JSON.parse(l));

    const client = lines.find((l) => l.source === "client" && l.screen === undefined && l.client?.screen === "/transaction/new");
    expect(client).toBeTruthy();
    expect(client.msg).toBe("[app] falha ao salvar R$ [valor] para [email]");
    expect(client.uid).toBe(w.user.id);
    expect(client.client).toMatchObject({ version: "0.1.0", platform: "android", kind: "js", context: { campo: "[numero]", ok: true } });
    expect(client.stack).toContain("Bearer [token]");
    expect(all).not.toContain("ana@exemplo.com");
    expect(all).not.toContain("abcdefghij1234567890");

    // erro do app (nível 50) aparece também no arquivo só de erros
    expect(errs).toContain("[app] falha ao salvar");
    // recusas da API carregam o código
    expect(lines.some((l) => l.msg === "requisição recusada" && l.code === "UNAUTHORIZED")).toBe(true);
    expect(lines.some((l) => l.msg === "requisição recusada" && l.uid === w.user.id)).toBe(true);
  });
});

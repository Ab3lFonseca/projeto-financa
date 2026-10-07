import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv, type TestUser } from "./helpers/env";
import { createWorld } from "./helpers/factories";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv(); // "hoje" = 2026-10-04
});
afterAll(async () => {
  await env.close();
});

async function member(): Promise<TestUser> {
  const u = await env.newUser();
  await u.get("/v1/me"); // provisiona
  return u;
}
async function makeAdmin(): Promise<TestUser> {
  const admin = await member();
  await env.prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
  env.app.users.invalidate(admin.id);
  return admin;
}
let n = 0;
const text = (extra = "") => `Gostaria de poder anexar fotos de recibos aos lançamentos ${++n} ${extra}`.trim();
const send = (u: TestUser, body: string) => u.post("/v1/suggestions", { body });

describe("enviar sugestões", () => {
  it("a sugestão chega como 'em análise' (branco) e aparece na lista da própria pessoa", async () => {
    const u = await member();
    const res = await send(u, "Queria um modo para dividir despesas com a família.");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ body: "Queria um modo para dividir despesas com a família.", status: "PENDING", adminNote: null, decidedAt: null });
    const mine = (await u.get("/v1/suggestions")).body;
    expect(mine.data).toHaveLength(1);
    expect(mine.data[0]).toMatchObject({ id: res.body.id, status: "PENDING" });
    expect(mine.remainingToday).toBe(4);
  });

  it("exige login", async () => {
    expect((await env.anon.get("/v1/suggestions")).status).toBe(401);
    expect((await env.anon.post("/v1/suggestions", { body: text() })).status).toBe(401);
  });

  it("valida o texto: de 10 a 1.000 caracteres, sem campos extras; limpa espaços e caracteres de controle", async () => {
    const u = await member();
    expect((await send(u, "curto")).status).toBe(422);
    expect((await send(u, "         ")).status).toBe(422);
    expect((await send(u, "a".repeat(1001))).status).toBe(422);
    expect((await u.post("/v1/suggestions", { body: text(), status: "APPROVED" })).status).toBe(422); // não dá para se auto-aprovar
    expect((await u.post("/v1/suggestions", {})).status).toBe(422);
    const ok = await send(u, "  Ideia   com\u0000 espaços   e controle  ");
    expect(ok.status).toBe(201);
    expect(ok.body.body).toBe("Ideia   com espaços   e controle");
    expect((await send(u, "b".repeat(1000))).status).toBe(201); // o limite exato vale
  });

  it("no máximo 5 por dia; passadas 24 horas volta a poder enviar", async () => {
    const clock = await createTestEnv();
    try {
      const u = await clock.newUser();
      await u.get("/v1/me");
      for (let i = 0; i < 5; i++) expect((await send(u, `Sugestão de número ${i} para o aplicativo`)).status).toBe(201);
      expect((await u.get("/v1/suggestions")).body.remainingToday).toBe(0);
      const sixth = await send(u, "Sugestão de número 6 para o aplicativo");
      expect(sixth.status).toBe(429);
      expect(sixth.body.error.code).toBe("CHANGE_LIMIT_REACHED");
      clock.setNow("2026-10-07T12:00:00.000Z");
      expect((await send(u, "Sugestão de número 6 para o aplicativo")).status).toBe(201);
    } finally {
      await clock.close();
    }
  });

  it("não aceita o mesmo texto duas vezes no mesmo dia (nem com outra caixa)", async () => {
    const u = await member();
    expect((await send(u, "Notificar quando a fatura fechar")).status).toBe(201);
    const dup = await send(u, "NOTIFICAR QUANDO A FATURA FECHAR");
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("SUGGESTION_DUPLICATE");
  });

  it("cada pessoa vê só as suas", async () => {
    const a = await member();
    const b = await member();
    await send(a, text("da A"));
    await send(b, text("da B"));
    expect((await a.get("/v1/suggestions")).body.data.map((s: any) => s.body).join("|")).toContain("da A");
    expect((await a.get("/v1/suggestions")).body.data.map((s: any) => s.body).join("|")).not.toContain("da B");
    expect((await b.get("/v1/suggestions")).body.data).toHaveLength(1);
  });

  it("a pessoa não consegue mudar a situação nem apagar (não existe rota para isso)", async () => {
    const u = await member();
    const s = (await send(u, text())).body;
    expect((await u.put(`/v1/suggestions/${s.id}`, { status: "APPROVED" })).status).toBe(404);
    expect((await u.delete(`/v1/suggestions/${s.id}`)).status).toBe(404);
    expect((await u.get("/v1/suggestions")).body.data[0].status).toBe("PENDING");
  });
});

describe("quadro do administrador", () => {
  it("só administrador entra (usuário comum recebe 403, sem login 401)", async () => {
    const u = await member();
    const s = (await send(u, text())).body;
    expect((await u.get("/v1/admin/suggestions")).status).toBe(403);
    expect((await u.put(`/v1/admin/suggestions/${s.id}`, { status: "APPROVED" })).status).toBe(403);
    expect((await env.anon.get("/v1/admin/suggestions")).status).toBe(401);
    expect((await u.get("/v1/suggestions")).body.data[0].status).toBe("PENDING"); // nada mudou
  });

  it("lista as sugestões de todos, com quem escreveu e o total de cada situação", async () => {
    const admin = await makeAdmin();
    const a = await member();
    await env.prisma.profile.update({ where: { userId: a.id }, data: { displayName: "Maria Teste" } });
    const mine = (await send(a, text("da Maria"))).body;
    const board = (await admin.get("/v1/admin/suggestions", { query: { limit: "100" } })).body;
    const found = board.data.find((s: any) => s.id === mine.id);
    expect(found).toMatchObject({ status: "PENDING", decidedByName: null });
    expect(found.author).toEqual({ id: a.id, name: "Maria Teste" });
    expect(typeof board.counts.PENDING).toBe("number");
    expect(board.counts.PENDING).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(board)).not.toMatch(/@teste\.dev/); // e-mail não vai no quadro (só o nome ou o começo dele)
  });

  it("verde = válida (passa para a validação): guarda quem decidiu, quando e o recado; a pessoa vê o resultado", async () => {
    const admin = await makeAdmin();
    const u = await member();
    const s = (await send(u, text("boa ideia"))).body;
    const res = await admin.put(`/v1/admin/suggestions/${s.id}`, { status: "APPROVED", note: "Vamos validar com a equipe." });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: s.id, status: "APPROVED", adminNote: "Vamos validar com a equipe." });
    expect(res.body.decidedAt).not.toBeNull();
    const row = await env.prisma.suggestion.findUnique({ where: { id: s.id } });
    expect(row).toMatchObject({ status: "APPROVED", decidedById: admin.id });
    const mine = (await u.get("/v1/suggestions")).body.data[0];
    expect(mine).toMatchObject({ status: "APPROVED", adminNote: "Vamos validar com a equipe." });
    expect(await env.prisma.auditLog.count({ where: { actorId: admin.id, action: "admin.suggestion.decided", entityId: s.id } })).toBe(1);
  });

  it("vermelho = não válida (não passa pela validação), com recado opcional", async () => {
    const admin = await makeAdmin();
    const u = await member();
    const s = (await send(u, text("fora do escopo"))).body;
    const res = await admin.put(`/v1/admin/suggestions/${s.id}`, { status: "REJECTED" });
    expect(res.body).toMatchObject({ status: "REJECTED", adminNote: null });
    expect((await u.get("/v1/suggestions")).body.data[0].status).toBe("REJECTED");
  });

  it("branco = devolve para 'em análise': some quem decidiu, a data e o recado", async () => {
    const admin = await makeAdmin();
    const u = await member();
    const s = (await send(u, text("indecisa"))).body;
    await admin.put(`/v1/admin/suggestions/${s.id}`, { status: "APPROVED", note: "ok" });
    const back = await admin.put(`/v1/admin/suggestions/${s.id}`, { status: "PENDING" });
    expect(back.body).toMatchObject({ status: "PENDING", adminNote: null, decidedAt: null });
    expect(await env.prisma.suggestion.findUnique({ where: { id: s.id } })).toMatchObject({ status: "PENDING", decidedById: null, decidedAt: null });
  });

  it("dá para mudar de ideia entre verde e vermelho, e cada decisão fica na auditoria", async () => {
    const admin = await makeAdmin();
    const u = await member();
    const s = (await send(u, text("virada"))).body;
    await admin.put(`/v1/admin/suggestions/${s.id}`, { status: "APPROVED" });
    await admin.put(`/v1/admin/suggestions/${s.id}`, { status: "REJECTED", note: "Depois de pensar, não cabe agora." });
    expect((await u.get("/v1/suggestions")).body.data[0]).toMatchObject({ status: "REJECTED", adminNote: "Depois de pensar, não cabe agora." });
    expect(await env.prisma.auditLog.count({ where: { action: "admin.suggestion.decided", entityId: s.id } })).toBe(2);
  });

  it("filtra por situação e conta cada uma", async () => {
    const admin = await makeAdmin();
    const u = await member();
    const [a, b, c] = [(await send(u, text("A"))).body, (await send(u, text("B"))).body, (await send(u, text("C"))).body];
    await admin.put(`/v1/admin/suggestions/${a.id}`, { status: "APPROVED" });
    await admin.put(`/v1/admin/suggestions/${b.id}`, { status: "REJECTED" });
    const approved = (await admin.get("/v1/admin/suggestions", { query: { status: "APPROVED", limit: "100" } })).body;
    expect(approved.data.every((s: any) => s.status === "APPROVED")).toBe(true);
    expect(approved.data.some((s: any) => s.id === a.id)).toBe(true);
    const pending = (await admin.get("/v1/admin/suggestions", { query: { status: "PENDING", limit: "100" } })).body;
    expect(pending.data.some((s: any) => s.id === c.id)).toBe(true);
    expect(pending.data.some((s: any) => s.id === a.id || s.id === b.id)).toBe(false);
    const all = (await admin.get("/v1/admin/suggestions", { query: { limit: "100" } })).body;
    expect(all.counts.APPROVED).toBeGreaterThanOrEqual(1);
    expect(all.counts.REJECTED).toBeGreaterThanOrEqual(1);
    expect((await admin.get("/v1/admin/suggestions", { query: { limit: "1" } })).body.data).toHaveLength(1);
  });

  it("recusa situação inventada, recado grande demais, campos extras e sugestão que não existe", async () => {
    const admin = await makeAdmin();
    const u = await member();
    const s = (await send(u, text())).body;
    expect((await admin.put(`/v1/admin/suggestions/${s.id}`, { status: "MAYBE" })).status).toBe(422);
    expect((await admin.put(`/v1/admin/suggestions/${s.id}`, { status: "APPROVED", note: "x".repeat(501) })).status).toBe(422);
    expect((await admin.put(`/v1/admin/suggestions/${s.id}`, { status: "APPROVED", body: "mudei o texto" })).status).toBe(422);
    expect((await admin.put(`/v1/admin/suggestions/00000000-0000-4000-8000-000000000000`, { status: "APPROVED" })).status).toBe(404);
    expect((await admin.put(`/v1/admin/suggestions/nao-e-uuid`, { status: "APPROVED" })).status).toBe(422);
    expect((await admin.get("/v1/admin/suggestions", { query: { status: "OUTRA" } })).status).toBe(422);
    // o texto da sugestão nunca é alterado pelo administrador
    expect((await env.prisma.suggestion.findUnique({ where: { id: s.id } }))?.body).toBe(s.body);
  });
});

describe("privacidade (LGPD)", () => {
  it("as sugestões entram na exportação dos dados da própria pessoa, sem dados de quem decidiu", async () => {
    const admin = await makeAdmin();
    const u = await member();
    const s = (await send(u, text("para exportar"))).body;
    await admin.put(`/v1/admin/suggestions/${s.id}`, { status: "APPROVED", note: "Anotado." });
    const exported = (await u.get("/v1/privacy/export")).body;
    expect(exported.data.suggestions).toHaveLength(1);
    expect(exported.data.suggestions[0]).toMatchObject({ status: "APPROVED", adminNote: "Anotado." });
    expect(JSON.stringify(exported.data.suggestions)).not.toContain(admin.id);
  });

  it("ao excluir a conta, as sugestões somem junto (sem deixar texto da pessoa para trás)", async () => {
    const w = await createWorld(env);
    await send(w.user, text("vai sumir"));
    expect(await env.prisma.suggestion.count({ where: { userId: w.user.id } })).toBe(1);
    // A exclusão final da conta remove a linha do usuário; as sugestões saem junto pela cascata do banco.
    await env.prisma.user.delete({ where: { id: w.user.id } });
    expect(await env.prisma.suggestion.count({ where: { userId: w.user.id } })).toBe(0);
  });

  it("apagar quem decidiu não apaga a sugestão (só limpa o campo)", async () => {
    const admin = await makeAdmin();
    const u = await member();
    const s = (await send(u, text("decidida"))).body;
    await admin.put(`/v1/admin/suggestions/${s.id}`, { status: "APPROVED" });
    await env.prisma.user.delete({ where: { id: admin.id } });
    expect(await env.prisma.suggestion.findUnique({ where: { id: s.id } })).toMatchObject({ status: "APPROVED", decidedById: null });
  });

  it("no banco, só valem as três situações e o texto mínimo (a regra vale mesmo fora da API)", async () => {
    const u = await member();
    const base = { userId: u.id, body: "Texto válido de sugestão" };
    await expect(env.prisma.suggestion.create({ data: { ...base, status: "TALVEZ" } })).rejects.toThrow();
    await expect(env.prisma.suggestion.create({ data: { ...base, body: "curto" } })).rejects.toThrow();
    await expect(env.prisma.suggestion.create({ data: { ...base, status: "REJECTED" } })).resolves.toBeTruthy();
  });
});

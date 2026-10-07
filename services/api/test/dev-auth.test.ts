import { mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DevAuthProvider } from "../src/modules/auth/dev-provider";

describe("autenticação local de desenvolvimento", () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dev-auth-"));
    file = join(dir, "dev-auth.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const SECRET = "x".repeat(32);

  it("enxerga o que outro processo gravou no arquivo (ex.: pnpm dev:seed -- --reset)", async () => {
    const server = new DevAuthProvider(SECRET, file);
    const seed = new DevAuthProvider(SECRET, file); // outro processo, mesmo arquivo

    const first = await seed.signUp({ email: "demo@financa.dev", password: "Demo@12345678", metadata: {} });
    expect((await server.signIn("demo@financa.dev", "Demo@12345678")).user.id).toBe(first.userId);

    // o seed apaga a conta e recria: o servidor em execução precisa ver a conta nova, não a antiga
    await seed.deleteUser(first.userId!);
    const second = await seed.signUp({ email: "demo@financa.dev", password: "Demo@12345678", metadata: {} });
    expect(second.userId).not.toBe(first.userId);
    // garante que o mtime mudou mesmo em sistemas de arquivos com resolução baixa
    const later = new Date(Date.now() + 5_000);
    utimesSync(file, later, later);

    expect((await server.signIn("demo@financa.dev", "Demo@12345678")).user.id).toBe(second.userId);
  });

  it("não perde usuários criados por outro processo ao gravar", async () => {
    const a = new DevAuthProvider(SECRET, file);
    const b = new DevAuthProvider(SECRET, file);
    await a.signUp({ email: "a@teste.dev", password: "senhaForte123", metadata: {} });
    await b.signUp({ email: "b@teste.dev", password: "senhaForte123", metadata: {} });
    const c = new DevAuthProvider(SECRET, file);
    await expect(c.signIn("a@teste.dev", "senhaForte123")).resolves.toBeTruthy();
    await expect(c.signIn("b@teste.dev", "senhaForte123")).resolves.toBeTruthy();
  });

  it("a sessão sobrevive ao reinício do servidor (o servidor de desenvolvimento reinicia a cada arquivo editado)", async () => {
    const before = new DevAuthProvider(SECRET, file);
    await before.signUp({ email: "a@teste.dev", password: "senhaForte123", metadata: {} });
    const session = await before.signIn("a@teste.dev", "senhaForte123");

    const afterRestart = new DevAuthProvider(SECRET, file); // processo novo, mesmo arquivo
    const renewed = await afterRestart.refresh(session.refreshToken);
    expect(renewed.user.email).toBe("a@teste.dev");
    expect(renewed.refreshToken).not.toBe(session.refreshToken);
    // cada token de renovação vale uma vez (rotação): o antigo não volta a valer nem depois de outro reinício
    await expect(new DevAuthProvider(SECRET, file).refresh(session.refreshToken)).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN" });
    await expect(new DevAuthProvider(SECRET, file).refresh(renewed.refreshToken)).resolves.toBeTruthy();
  });

  it("sair encerra as sessões também depois de um reinício; token inventado continua recusado", async () => {
    const a = new DevAuthProvider(SECRET, file);
    await a.signUp({ email: "a@teste.dev", password: "senhaForte123", metadata: {} });
    const session = await a.signIn("a@teste.dev", "senhaForte123");
    await a.signOut(session.accessToken);
    await expect(new DevAuthProvider(SECRET, file).refresh(session.refreshToken)).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN" });
    await expect(new DevAuthProvider(SECRET, file).refresh("dev-inventado")).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN" });
  });

  it("arquivo de sessões corrompido não derruba o servidor (só ninguém continua logado)", async () => {
    const a = new DevAuthProvider(SECRET, file);
    await a.signUp({ email: "a@teste.dev", password: "senhaForte123", metadata: {} });
    const session = await a.signIn("a@teste.dev", "senhaForte123");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(`${file}.sessions`, "{ isto não é json");
    const b = new DevAuthProvider(SECRET, file);
    await expect(b.refresh(session.refreshToken)).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN" });
    await expect(b.signIn("a@teste.dev", "senhaForte123")).resolves.toBeTruthy(); // entrar de novo funciona
  });

  it("senha errada continua recusada", async () => {
    const p = new DevAuthProvider(SECRET, file);
    await p.signUp({ email: "a@teste.dev", password: "senhaForte123", metadata: {} });
    await expect(p.signIn("a@teste.dev", "errada")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});

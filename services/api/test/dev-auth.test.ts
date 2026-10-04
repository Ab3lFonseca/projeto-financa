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

  it("senha errada continua recusada", async () => {
    const p = new DevAuthProvider(SECRET, file);
    await p.signUp({ email: "a@teste.dev", password: "senhaForte123", metadata: {} });
    await expect(p.signIn("a@teste.dev", "errada")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});

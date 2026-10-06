import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

describe("migrations automáticas na imagem da API", () => {
  const dockerfile = read("services", "api", "Dockerfile");
  const entrypoint = read("services", "api", "docker-entrypoint.sh");
  const deployConfig = read("packages", "database", "prisma.deploy.config.mjs");
  const pkg = JSON.parse(read("packages", "database", "package.json")) as { devDependencies: Record<string, string> };

  it("o CLI do Prisma da imagem é exatamente a versão do projeto (senão o schema engine diverge do que foi testado)", () => {
    const version = pkg.devDependencies.prisma;
    expect(version).toMatch(/^\d+\.\d+\.\d+$/); // fixada, sem ^ nem ~
    expect(dockerfile).toContain(`prisma@${version}`);
  });

  it("a imagem inicia pelo entrypoint, que aplica as migrations antes de subir o servidor e falha alto se elas falharem", () => {
    expect(dockerfile).toContain('CMD ["/usr/local/bin/docker-entrypoint.sh"]');
    expect(entrypoint).toContain("set -eu"); // qualquer erro derruba o contêiner (o deploy é dado como falho)
    const migrate = entrypoint.indexOf("prisma migrate deploy");
    const server = entrypoint.indexOf("exec node services/api/dist/server.js");
    expect(migrate).toBeGreaterThan(-1);
    expect(server).toBeGreaterThan(migrate);
    expect(entrypoint).toContain("MIGRATE_ON_START");
    expect(entrypoint).toContain("timeout"); // não trava o deploy se o banco não responde
  });

  it("usa a configuração mínima: sem imports (a imagem não leva prisma/config nem dotenv) e lendo a conexão do ambiente", () => {
    expect(entrypoint).toContain("--config prisma.deploy.config.mjs");
    expect(deployConfig).not.toMatch(/^\s*import\s/m);
    expect(deployConfig).toContain("process.env.DIRECT_URL");
    expect(deployConfig).toContain("process.env.DATABASE_URL");
    expect(deployConfig).toContain('path: "prisma/migrations"');
  });

  it("o contêiner roda como usuário comum e o motor de migrations tem OpenSSL", () => {
    expect(dockerfile).toMatch(/^USER node$/m);
    expect(dockerfile.match(/openssl/g)?.length).toBeGreaterThanOrEqual(2); // estágio do migrator e estágio final
  });

  it("o entrypoint usa finais de linha LF (um CR quebraria o #! no Linux)", () => {
    expect(entrypoint).not.toContain("\r");
    expect(entrypoint.startsWith("#!/bin/sh\n")).toBe(true);
  });
});

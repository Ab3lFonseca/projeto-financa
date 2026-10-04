// Uso:
//   pnpm --filter @app/dev-db start   → sobe o Postgres de desenvolvimento (Ctrl+C para parar)
//   pnpm --filter @app/dev-db reset   → apaga o cluster local (recomeça do zero)
import { rmSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { DEV_PASSWORD, DEV_PORT, startDevDb } from "./index";

const dataDir = resolve(import.meta.dirname, "..", ".data", "postgres");
const command = process.argv[2] ?? "start";

if (command === "reset") {
  rmSync(dataDir, { recursive: true, force: true });
  console.log("Cluster de desenvolvimento apagado.");
  process.exit(0);
}

if (command !== "start") {
  console.error(`Comando desconhecido: ${command}. Use "start" ou "reset".`);
  process.exit(1);
}

/** A porta já está ocupada? (o Postgres de desenvolvimento escuta só em 127.0.0.1) */
function portInUse(port: number): Promise<boolean> {
  return new Promise((done) => {
    const probe = createServer();
    probe.once("error", (err: NodeJS.ErrnoException) => done(err.code === "EADDRINUSE"));
    probe.once("listening", () => probe.close(() => done(false)));
    probe.listen(port, "127.0.0.1");
  });
}

if (await portInUse(DEV_PORT)) {
  console.error(`\nO banco de desenvolvimento JÁ ESTÁ RODANDO (a porta ${DEV_PORT} está em uso). Você não precisa subir outro:`);
  console.error(`siga para "pnpm dev:api". Se foi um terminal que você esqueceu aberto, ele ainda serve.`);
  console.error(`\nPara reiniciar, descubra e encerre o processo (PowerShell):`);
  console.error(`  Get-NetTCPConnection -LocalPort ${DEV_PORT} -State Listen | Select-Object OwningProcess`);
  console.error(`  Stop-Process -Id <o número acima>\n`);
  process.exit(1);
}

let db: Awaited<ReturnType<typeof startDevDb>>;
try {
  db = await startDevDb({ dataDir, port: DEV_PORT });
} catch (err) {
  console.error("\nNão foi possível subir o banco de desenvolvimento:", err instanceof Error ? err.message : (err ?? "(o erro veio sem mensagem)"));
  console.error("Dicas: rode com DEV_DB_VERBOSE=1 para ver o log do Postgres; se o computador foi desligado de repente,");
  console.error(`apague o arquivo packages\\dev-db\\.data\\postgres\\postmaster.pid e tente de novo.`);
  console.error(`Último recurso (APAGA os dados locais): pnpm --filter @app/dev-db reset\n`);
  process.exit(1);
}
console.log(`Postgres de desenvolvimento no ar (Ctrl+C para parar).`);
console.log(`DATABASE_URL="postgresql://postgres:${DEV_PASSWORD}@127.0.0.1:${db.port}/${db.database}"`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("\nParando Postgres...");
  await db.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// mantém o processo vivo
setInterval(() => {}, 1 << 30);

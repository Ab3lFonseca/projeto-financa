// Uso:
//   pnpm --filter @app/dev-db start   → sobe o Postgres de desenvolvimento (Ctrl+C para parar)
//   pnpm --filter @app/dev-db reset   → apaga o cluster local (recomeça do zero)
import { rmSync } from "node:fs";
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

const db = await startDevDb({ dataDir, port: DEV_PORT });
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

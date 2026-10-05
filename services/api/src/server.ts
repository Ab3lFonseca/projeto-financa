import { config as loadDotenv } from "dotenv";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { startJobs } from "./jobs/scheduler";

loadDotenv({ path: ["../../.env", ".env"], quiet: true });

const config = loadConfig();
const app = await buildApp({ config });

let stopJobs: (() => void) | null = null;

async function shutdown(signal: string) {
  app.log.info({ signal }, "encerrando");
  try {
    stopJobs?.();
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, "falha ao encerrar");
    process.exit(1);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// Falhas que escapam de qualquer tratamento: ficam registradas (com stack) ANTES de o processo cair.
// Depois de uma exceção não capturada o estado do processo é incerto, então encerramos e deixamos o
// orquestrador (Fly) subir uma instância nova.
function fatal(kind: string, err: unknown) {
  app.log.fatal({ err, kind }, "falha fatal; encerrando o processo");
  // Dá tempo de os arquivos de log gravarem a última linha.
  setTimeout(() => process.exit(1), 300).unref();
}
process.on("uncaughtException", (err) => fatal("uncaughtException", err));
process.on("unhandledRejection", (reason) => fatal("unhandledRejection", reason));

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  // corsOrigins vazio = CORS desligado: o app nativo funciona, mas o app web (navegador) é bloqueado.
  app.log.info({ port: config.PORT, env: config.NODE_ENV, auth: config.AUTH_MODE, jobs: config.JOBS_ENABLED, openFinance: config.OPEN_FINANCE_ENABLED, corsOrigins: config.CORS_ORIGINS }, "API no ar");
  if (config.JOBS_ENABLED) stopJobs = startJobs(app);
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
    // Erro comum em desenvolvimento: a API já está rodando em outro terminal.
    app.log.error(
      { port: config.PORT },
      `A porta ${config.PORT} já está em uso: provavelmente a API já está rodando em outro terminal (ela continua funcionando). ` +
        `Para achar o processo (PowerShell): Get-NetTCPConnection -LocalPort ${config.PORT} -State Listen | Select-Object OwningProcess`,
    );
  } else {
    app.log.error({ err }, "falha ao iniciar");
  }
  process.exit(1);
}

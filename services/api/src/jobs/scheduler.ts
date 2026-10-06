import type { PrismaClient } from "@app/database";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { finalizeDeletions } from "../modules/privacy/service";
import { runOpenFinanceJob } from "../modules/open-finance/service";
import { beforeEraseOf } from "../modules/privacy/before-erase";
import { runDueRecurrences } from "../modules/recurring/service";
import { runMaintenance } from "./maintenance";
import { runReminders } from "./reminders";

/** Chaves de advisory lock: só UMA instância da API executa cada job por vez. */
const LOCK = { recurrences: 7_001, reminders: 7_002, deletions: 7_003, maintenance: 7_004, openFinance: 7_005 } as const;

/**
 * Executa `fn` somente se esta instância conseguir o lock do job. O lock é de transação
 * (pg_try_advisory_xact_lock): se a instância cair, ele é liberado sozinho.
 */
export async function withJobLock(prisma: PrismaClient, key: number, fn: () => Promise<void>): Promise<boolean> {
  let ran = false;
  await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(${key}::bigint) AS ok`;
      if (!rows[0]?.ok) return;
      ran = true;
      await fn();
    },
    { timeout: 15 * 60_000, maxWait: 5_000 },
  );
  return ran;
}

type JobDef = { name: string; lock: number; everyMs: number; run: () => Promise<unknown> };

/** Agenda os jobs em processo (sem Redis/fila externa). Retorna a função que para tudo. */
export function startJobs(app: FastifyInstance): () => void {
  const { prisma, config } = app;
  const log: FastifyBaseLogger = app.log;
  const deps = { notifier: app.notifier };
  const authDeps = () => ({
    prisma,
    authProvider: app.authProvider,
    pepper: config.IP_HASH_PEPPER,
    now: () => app.clock(),
    log,
    beforeErase: beforeEraseOf(app),
  });

  const jobs: JobDef[] = [
    { name: "recorrencias", lock: LOCK.recurrences, everyMs: 15 * 60_000, run: () => runDueRecurrences(prisma, app.clock(), deps, log) },
    { name: "lembretes", lock: LOCK.reminders, everyMs: 60 * 60_000, run: () => runReminders(prisma, app.clock(), deps, log) },
    { name: "exclusoes", lock: LOCK.deletions, everyMs: 10 * 60_000, run: () => finalizeDeletions(authDeps()) },
    { name: "manutencao", lock: LOCK.maintenance, everyMs: 6 * 60 * 60_000, run: () => runMaintenance(prisma, app.clock()) },
  ];
  // Open Finance só entra se estiver ligado e configurado neste servidor.
  const openFinance = app.openFinance;
  if (openFinance) {
    jobs.push({ name: "open-finance", lock: LOCK.openFinance, everyMs: 6 * 60 * 60_000, run: () => runOpenFinanceJob(openFinance.deps) });
  }

  const timers: NodeJS.Timeout[] = [];
  let running = true;

  const tick = async (job: JobDef) => {
    if (!running) return;
    try {
      await withJobLock(prisma, job.lock, async () => {
        const result = await job.run();
        log.info({ job: job.name, result }, "job concluído");
      });
    } catch (err) {
      log.error({ err, job: job.name }, "job falhou");
    }
  };

  for (const [i, job] of jobs.entries()) {
    // Escalona a primeira execução para não competir por conexões logo na subida.
    timers.push(setTimeout(() => void tick(job), 15_000 + i * 5_000).unref());
    timers.push(setInterval(() => void tick(job), job.everyMs).unref());
  }

  return () => {
    running = false;
    for (const t of timers) {
      clearTimeout(t);
      clearInterval(t);
    }
  };
}

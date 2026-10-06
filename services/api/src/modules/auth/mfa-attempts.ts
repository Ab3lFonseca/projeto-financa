import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { audit } from "../../lib/audit";
import { AppError } from "../../lib/errors";

/** Códigos errados permitidos antes de a sessão ser encerrada. */
export const MFA_MAX_ATTEMPTS = 3;
/** Por quanto tempo os erros contam (e, depois do 3º, a verificação fica travada). */
export const MFA_LOCK_MINUTES = 15;

/** Códigos errados desde o último acerto, dentro da janela. Acertar zera a conta; entrar de novo com a senha NÃO zera (senão o limite não protegeria nada). */
export async function mfaFailuresOf(app: FastifyInstance, userId: string): Promise<number> {
  const since = new Date(app.clock().getTime() - MFA_LOCK_MINUTES * 60_000);
  const lastOk = await app.prisma.auditLog.findFirst({
    where: { actorId: userId, action: "auth.mfa_verified", createdAt: { gt: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return app.prisma.auditLog.count({ where: { actorId: userId, action: "auth.mfa_failed", createdAt: lastOk ? { gt: lastOk.createdAt } : { gte: since } } });
}

const lockedError = () =>
  new AppError(429, "MFA_LOCKED", `Você errou o código ${MFA_MAX_ATTEMPTS} vezes. Por segurança, foi desconectado. Aguarde ${MFA_LOCK_MINUTES} minutos e entre de novo.`);

/** Encerra só ESTA sessão (as de outros aparelhos da pessoa continuam). Se o provedor falhar, o bloqueio por tempo continua valendo. */
async function endSession(app: FastifyInstance, token: string, log: FastifyBaseLogger): Promise<void> {
  try {
    await app.authProvider.signOut(token, "local");
  } catch (err) {
    log.warn({ err }, "não foi possível encerrar a sessão após o bloqueio da verificação em duas etapas");
  }
}

/**
 * Confere um código do aplicativo autenticador com limite de tentativas: cada código errado é registrado e mostra quantas restam; no 3º erro a
 * sessão é encerrada e novas tentativas ficam travadas por 15 minutos (`429 MFA_LOCKED`). Só `INVALID_MFA_CODE` conta: erro de rede ou do
 * provedor não gasta tentativa de ninguém.
 */
export async function checkMfaCode<T>(app: FastifyInstance, ctx: { userId: string; token: string; ip: string; log: FastifyBaseLogger }, run: () => Promise<T>): Promise<T> {
  const failures = await mfaFailuresOf(app, ctx.userId);
  if (failures >= MFA_MAX_ATTEMPTS) {
    await endSession(app, ctx.token, ctx.log);
    throw lockedError();
  }
  try {
    return await run();
  } catch (err) {
    if (!(err instanceof AppError) || err.code !== "INVALID_MFA_CODE") throw err;
    // `at`: mesmo relógio da janela de 15 minutos acima (o do app), para a contagem nunca depender do relógio do banco.
    await audit(app.prisma, app.config.IP_HASH_PEPPER, { actorId: ctx.userId, action: "auth.mfa_failed", ip: ctx.ip, at: app.clock() }, ctx.log);
    const left = MFA_MAX_ATTEMPTS - (failures + 1);
    if (left <= 0) {
      await endSession(app, ctx.token, ctx.log);
      throw lockedError();
    }
    throw new AppError(422, "INVALID_MFA_CODE", `Código incorreto ou expirado. Você tem mais ${left} tentativa${left === 1 ? "" : "s"} antes de ser desconectado.`, { attemptsLeft: left });
  }
}

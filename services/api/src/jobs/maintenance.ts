import type { PrismaClient } from "@app/database";

const DAY = 86_400_000;

/**
 * Retenção de dados operacionais (ver docs/database.md, seção LGPD):
 *   chaves de idempotência 48h · webhooks 30 dias (do banco e do pagamento; o Stripe só reenvia por ~3 dias) · auditoria 6 meses ·
 *   notificações lidas 90 dias · tokens de push sem uso 180 dias.
 * Dados financeiros do usuário NÃO são apagados aqui: duram enquanto a conta existir.
 */
export async function runMaintenance(prisma: PrismaClient, now: Date): Promise<Record<string, number>> {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const [idem, hooks, billingHooks, audits, notifs, tokens] = [
    await prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: ago(2) } } }),
    await prisma.webhookEvent.deleteMany({ where: { receivedAt: { lt: ago(30) } } }),
    await prisma.billingEvent.deleteMany({ where: { receivedAt: { lt: ago(30) } } }),
    await prisma.auditLog.deleteMany({ where: { createdAt: { lt: ago(180) } } }),
    await prisma.notification.deleteMany({ where: { readAt: { not: null, lt: ago(90) } } }),
    await prisma.pushToken.deleteMany({ where: { lastSeenAt: { lt: ago(180) } } }),
  ];
  return {
    idempotencyKeys: idem.count,
    webhookEvents: hooks.count,
    billingEvents: billingHooks.count,
    auditLogs: audits.count,
    notifications: notifs.count,
    pushTokens: tokens.count,
  };
}

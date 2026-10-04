import type { PrismaClient } from "@app/database";
import type { FastifyBaseLogger } from "fastify";
import { hashIp } from "./ip";

export type AuditEntry = {
  actorId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  ip?: string;
  /** Instante do evento (padrão: agora, pelo relógio do banco). Quem usa o relógio da aplicação passa o seu. */
  at?: Date;
  /** NUNCA incluir senha, token, valores financeiros ou dados bancários. */
  metadata?: Record<string, string | number | boolean | null>;
};

/** Trilha de auditoria. Falhar ao auditar não derruba a operação principal. */
export async function audit(
  prisma: PrismaClient,
  pepper: string,
  entry: AuditEntry,
  log?: FastifyBaseLogger,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        entity: entry.entity ?? null,
        entityId: entry.entityId ?? null,
        ipHash: hashIp(entry.ip, pepper),
        ...(entry.at ? { createdAt: entry.at } : {}),
        metadata: entry.metadata ?? undefined,
      },
    });
  } catch (err) {
    log?.error({ err, action: entry.action }, "falha ao gravar auditoria");
  }
}

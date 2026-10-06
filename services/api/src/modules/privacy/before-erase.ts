import type { FastifyInstance } from "fastify";
import { revokeAllConnections } from "../open-finance/service";

/**
 * O que precisa acontecer ANTES de apagar uma conta, nos serviços de fora: encerrar as conexões bancárias (Open Finance) e apagar o cliente do
 * pagamento (que cancela a assinatura). Se algo falhar, a exclusão fica pela metade e o job de retomada tenta de novo.
 */
export function beforeEraseOf(app: FastifyInstance): (userId: string) => Promise<void> {
  return async (userId) => {
    if (app.openFinance) await revokeAllConnections(app.openFinance.deps, userId, { strict: true });
    await app.billing.eraseCustomer(userId);
  };
}

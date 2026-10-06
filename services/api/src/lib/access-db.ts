import type { PrismaClient } from "@app/database";
import type { Config } from "../config";
import { resolveAccess, type AccessConfig, type AccessInfo } from "./access";

/** Parte da configuração que decide o acesso (cobrança ligada, dias de teste e início da cobrança). */
export function accessConfigOf(config: Pick<Config, "BILLING_ENFORCED" | "TRIAL_DAYS" | "BILLING_STARTS_AT">): AccessConfig {
  return { billingEnforced: config.BILLING_ENFORCED, trialDays: config.TRIAL_DAYS, billingStartsAt: config.BILLING_STARTS_AT ?? null };
}

/** Campos da assinatura que a regra de acesso lê (um só lugar, para as consultas não divergirem). */
export const subscriptionAccessSelect = {
  plan: true,
  status: true,
  store: true,
  currentPeriodEnd: true,
  trialEndsAt: true,
  cancelAtPeriodEnd: true,
  investmentsAddon: true,
} as const;

/** Carrega papel, data de cadastro e assinatura de um usuário e decide o acesso dele. Nulo se o usuário não existe. */
export async function loadAccess(prisma: PrismaClient, userId: string, config: AccessConfig, now: Date): Promise<AccessInfo | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, createdAt: true, subscription: { select: subscriptionAccessSelect } },
  });
  if (!user) return null;
  return resolveAccess({ role: user.role, createdAt: user.createdAt, subscription: user.subscription, config, now });
}

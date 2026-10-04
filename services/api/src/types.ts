import type { PrismaClient } from "@app/database";
import type { PlanName } from "@app/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "./config";
import type { AuthProvider } from "./modules/auth/provider";
import type { TokenVerifier } from "./modules/auth/token-verifier";
import type { UserDirectory } from "./modules/users/directory";
import type { PushNotifier } from "./modules/notifications/notifier";
import type { OpenFinanceRuntime } from "./modules/open-finance/service";

/** Usuário autenticado da requisição atual. */
export type AuthUser = {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  /** Plano EFETIVO (já considera BILLING_ENFORCED e validade da assinatura). */
  plan: PlanName;
  timezone: string;
  /** Aceitou a versão vigente dos Termos e da Política de Privacidade. */
  consentOk: boolean;
};

declare module "fastify" {
  interface FastifyInstance {
    config: Config;
    prisma: PrismaClient;
    authProvider: AuthProvider;
    tokenVerifier: TokenVerifier;
    users: UserDirectory;
    notifier: PushNotifier;
    /** Open Finance (null = desligado neste servidor). */
    openFinance: OpenFinanceRuntime | null;
    /** Relógio injetável (testes). */
    clock: () => Date;
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireConsent: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: AuthUser | null;
    /** Token bruto (necessário no logout e na troca de senha). */
    accessToken: string | null;
  }
}

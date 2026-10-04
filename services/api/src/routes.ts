import type { FastifyInstance } from "fastify";
import { accountRoutes } from "./modules/accounts/routes";
import { adminRoutes } from "./modules/admin/routes";
import { bankRoutes } from "./modules/banks/routes";
import { budgetRoutes } from "./modules/budgets/routes";
import { cardRoutes } from "./modules/cards/routes";
import { categoryRoutes } from "./modules/categories/routes";
import { dashboardRoutes } from "./modules/dashboard/routes";
import { goalRoutes } from "./modules/goals/routes";
import { notificationRoutes } from "./modules/notifications/routes";
import { openFinanceRoutes } from "./modules/open-finance/routes";
import { recurringRoutes } from "./modules/recurring/routes";
import { reportRoutes } from "./modules/reports/routes";
import { transactionRoutes } from "./modules/transactions/routes";
import { transferRoutes } from "./modules/transfers/routes";

/**
 * Módulos de domínio: só são alcançados por usuários autenticados que aceitaram os termos vigentes.
 */
export async function registerDomainRoutes(scope: FastifyInstance): Promise<void> {
  await scope.register(bankRoutes, { prefix: "/banks" });
  await scope.register(categoryRoutes, { prefix: "/categories" });
  await scope.register(accountRoutes, { prefix: "/accounts" });
  await scope.register(cardRoutes, { prefix: "/cards" });
  await scope.register(transactionRoutes, { prefix: "/transactions" });
  await scope.register(transferRoutes, { prefix: "/transfers" });
  await scope.register(recurringRoutes, { prefix: "/recurring" });
  await scope.register(budgetRoutes, { prefix: "/budgets" });
  await scope.register(goalRoutes, { prefix: "/goals" });
  await scope.register(dashboardRoutes, { prefix: "/dashboard" });
  await scope.register(reportRoutes, { prefix: "/reports" });
  await scope.register(adminRoutes, { prefix: "/admin" });
  await scope.register(notificationRoutes, { prefix: "/notifications" });
  await scope.register(openFinanceRoutes, { prefix: "/open-finance" });
}

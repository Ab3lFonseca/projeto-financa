import type * as S from "@app/shared";
import type { z } from "@app/shared";
import { Platform } from "react-native";
import { http } from "./client";

type In<T extends z.ZodType> = z.input<T>;
type Out<T extends z.ZodType> = z.output<T>;

export type Page<T> = { data: T[]; page: { nextCursor: string | null; hasMore: boolean } };
export type List<T> = { data: T[] };

// ----- tipos usados pelas telas -----
export type Me = S.MeDTO;
export type Dashboard = S.DashboardDTO;
export type Transaction = S.TransactionDTO;
export type Account = S.AccountDTO;
export type AccountDetail = S.AccountDetailDTO;
export type Bank = S.BankDTO;
export type Card = S.CardDTO;
export type Invoice = S.InvoiceDTO;
export type InvoiceDetail = S.InvoiceDetailDTO;
export type InstallmentPlan = S.InstallmentPlanDTO;
export type Category = S.CategoryDTO;
export type Budget = S.BudgetDTO;
export type BudgetsOverview = S.BudgetsResponse;
export type Goal = S.GoalDTO;
export type GoalDetail = Out<typeof S.goalDetailDTO>;
export type RecurringRule = S.RecurringRuleDTO;
export type Upcoming = Out<typeof S.upcomingOccurrenceDTO>;
export type AppNotification = S.NotificationDTO;
export type Consents = Out<typeof S.consentsResponse>;
export type PrivacyRequest = Out<typeof S.privacyRequestDTO>;
export type Transfer = S.TransferDTO;
export type Session = S.SessionResponse;
export type CategoryBreakdown = S.CategoryBreakdownDTO;
export type IncomeVsExpense = S.IncomeVsExpenseDTO;
export type BalanceEvolution = S.BalanceEvolutionDTO;
export type CashFlow = S.CashFlowDTO;
export type MonthComparison = S.MonthComparisonDTO;
export type TransactionSummary = Out<typeof S.transactionSummaryDTO>;
export type InvoicePayment = Out<typeof S.invoicePaymentDTO>;
export type GoalContribution = Out<typeof S.goalContributionDTO>;
export type MyAccount = S.MyAccountDTO;
export type LoginResult = S.LoginResponse;
export type MfaEnrollment = Out<typeof S.mfaEnrollDTO>;
export type OAuthProvider = S.OAuthProviderInfo;
export type AdminAuditEntry = S.AdminAuditEntryDTO;
export type Billing = S.BillingDTO;
export type Checkout = Out<typeof S.checkoutDTO>;
export type AdminUser = S.AdminUserDTO;
export type AdminUserDetail = S.AdminUserDetailDTO;
export type AdminStats = S.AdminStatsDTO;
export type AdminIntegrations = S.AdminIntegrationsDTO;
export type OpenFinanceStatus = S.OpenFinanceStatusDTO;
export type BankConnection = S.ConnectionDTO;
export type BankTransaction = S.BankTransactionDTO;
export type ConnectToken = Out<typeof S.connectTokenDTO>;
export type Investment = S.InvestmentDTO;
export type InvestmentsOverview = S.InvestmentsResponse;
export type InvestmentDetail = S.InvestmentDetailDTO;
export type BankOverview = S.BankOverviewDTO;
export type CardBankData = S.CardBankDataDTO;

export type ReportRange = "this_month" | "last_3_months" | "last_6_months" | "this_year" | "custom";
export type ReportParams = { range: ReportRange; from?: string; to?: string };

export type TransactionFilters = {
  from?: string;
  to?: string;
  type?: string[];
  categoryId?: string[];
  uncategorized?: boolean;
  accountId?: string;
  cardId?: string;
  invoiceId?: string;
  paymentMethod?: string[];
  status?: "PENDING" | "POSTED";
  q?: string;
  minAmountCents?: number;
  maxAmountCents?: number;
  sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
};

export type CreateTransactionInput = In<typeof S.createTransactionBody>;
export type UpdateTransactionInput = In<typeof S.updateTransactionBody>;

const v1 = "/v1";

export const api = {
  auth: {
    /** Com a verificação em duas etapas ligada, `mfa` vem preenchido: a sessão ainda precisa do código (`mfaVerify`). */
    login: (email: string, password: string) => http.post<LoginResult>(`${v1}/auth/login`, { email, password }, { auth: false }),
    /** Segundo passo do login: usa a sessão "só senha" já guardada e devolve uma sessão verificada. */
    mfaVerify: (factorId: string, code: string) => http.post<Session>(`${v1}/auth/mfa/verify`, { factorId, code }),
    oauthProviders: () => http.get<{ providers: OAuthProvider[] }>(`${v1}/auth/oauth/providers`, { auth: false }),
    oauthStart: (provider: string, codeChallenge: string) =>
      http.post<{ url: string }>(`${v1}/auth/oauth/start`, { provider, codeChallenge, platform: Platform.OS === "web" ? "web" : "native" }, { auth: false }),
    oauthExchange: (code: string, codeVerifier: string) => http.post<LoginResult>(`${v1}/auth/oauth/exchange`, { code, codeVerifier }, { auth: false }),
    // `platform` diz à API para onde o link do e-mail de confirmação deve levar (a tela /confirm-email do app ou do site).
    register: (body: In<typeof S.registerBody>) =>
      http.post<Out<typeof S.registerResponse>>(`${v1}/auth/register`, { ...body, platform: Platform.OS === "web" ? "web" : "native" }, { auth: false }),
    forgotPassword: (email: string) => http.post<{ ok: true }>(`${v1}/auth/forgot-password`, { email }, { auth: false }),
    resendVerification: (email: string) =>
      http.post<{ ok: true }>(`${v1}/auth/resend-verification`, { email, platform: Platform.OS === "web" ? "web" : "native" }, { auth: false }),
    logout: () => http.post<{ ok: true }>(`${v1}/auth/logout`),
  },

  me: {
    get: () => http.get<Me>(`${v1}/me`),
    update: (body: In<typeof S.updateProfileBody>) => http.patch<Me>(`${v1}/me`, body),
    /** Sem `currentPassword` só vale para quem ainda não tem senha (entrou por Google/Facebook) e fez login há pouco. */
    changePassword: (currentPassword: string | undefined, newPassword: string) =>
      http.post<{ ok: true }>(`${v1}/me/change-password`, { currentPassword, newPassword }),
    /** Sem `password`, só para contas sem senha, com login recente. */
    deleteAccount: (password?: string) => http.delete<{ ok: true }>(`${v1}/me`, { body: { password, confirm: "EXCLUIR" } }),
    account: () => http.get<MyAccount>(`${v1}/me/account`),
    changeEmail: (newEmail: string, password: string) =>
      http.post<{ ok: true; pendingEmail: string }>(`${v1}/me/change-email`, { newEmail, password, platform: Platform.OS === "web" ? "web" : "native" }),
    resetLink: () => http.post<{ ok: true }>(`${v1}/me/reset-link`),
    securityPromptAnswered: () => http.post<{ ok: true }>(`${v1}/me/security-prompt`),
    trialIntroSeen: () => http.post<{ ok: true }>(`${v1}/me/trial-intro-seen`),
    mfaEnroll: () => http.post<MfaEnrollment>(`${v1}/me/mfa/enroll`),
    /** Confirma com o primeiro código. Devolve a sessão nova (já verificada), que precisa substituir a atual. */
    mfaEnable: (factorId: string, code: string) => http.post<Session>(`${v1}/me/mfa/enable`, { factorId, code }),
    mfaDisable: (code: string) => http.post<{ ok: true }>(`${v1}/me/mfa/disable`, { code }),
    registerPushToken: (expoToken: string, platform: "IOS" | "ANDROID", deviceName?: string) =>
      http.post<{ ok: true }>(`${v1}/me/push-tokens`, { expoToken, platform, deviceName }),
    removePushToken: (token: string) => http.delete<{ ok: true }>(`${v1}/me/push-tokens`, { query: { token } }),
  },

  privacy: {
    consents: () => http.get<Consents>(`${v1}/privacy/consents`),
    setConsent: (type: "TERMS" | "PRIVACY" | "OPEN_FINANCE" | "MARKETING", version: string, granted: boolean) =>
      http.post<Consents>(`${v1}/privacy/consents`, { type, version, granted }),
    exportData: () => http.get<string>(`${v1}/privacy/export`, { raw: true }),
    requests: () => http.get<List<PrivacyRequest>>(`${v1}/privacy/requests`),
  },

  dashboard: () => http.get<Dashboard>(`${v1}/dashboard`),
  banks: () => http.get<List<Bank>>(`${v1}/banks`),

  categories: {
    list: (params: { type?: "EXPENSE" | "INCOME"; includeArchived?: boolean } = {}) => http.get<List<Category>>(`${v1}/categories`, { query: params }),
    create: (body: In<typeof S.createCategoryBody>) => http.post<Category>(`${v1}/categories`, body),
    update: (id: string, body: In<typeof S.updateCategoryBody>) => http.put<Category>(`${v1}/categories/${id}`, body),
    remove: (id: string, reassignTo?: string) => http.delete<{ ok: true }>(`${v1}/categories/${id}`, { query: { reassignTo } }),
  },

  accounts: {
    list: (includeArchived = false) => http.get<List<Account>>(`${v1}/accounts`, { query: { includeArchived } }),
    get: (id: string) => http.get<AccountDetail>(`${v1}/accounts/${id}`),
    create: (body: In<typeof S.createAccountBody>) => http.post<Account>(`${v1}/accounts`, body),
    update: (id: string, body: In<typeof S.updateAccountBody>) => http.put<Account>(`${v1}/accounts/${id}`, body),
    remove: (id: string) => http.delete<{ ok: true }>(`${v1}/accounts/${id}`),
  },

  transactions: {
    list: (filters: TransactionFilters & { cursor?: string; limit?: number }) =>
      http.get<Page<Transaction>>(`${v1}/transactions`, { query: filters as never }),
    summary: (filters: TransactionFilters) => http.get<TransactionSummary>(`${v1}/transactions/summary`, { query: filters as never }),
    get: (id: string) => http.get<Transaction>(`${v1}/transactions/${id}`),
    create: (body: CreateTransactionInput, idempotencyKey?: string) =>
      http.post<Transaction>(`${v1}/transactions`, body, { idempotencyKey }),
    update: (id: string, body: UpdateTransactionInput) => http.put<Transaction>(`${v1}/transactions/${id}`, body),
    remove: (id: string, scope: "one" | "group" = "one") => http.delete<{ ok: true }>(`${v1}/transactions/${id}`, { query: { scope } }),
  },

  transfers: {
    create: (body: In<typeof S.createTransferBody>, idempotencyKey?: string) => http.post<Transfer>(`${v1}/transfers`, body, { idempotencyKey }),
    get: (id: string) => http.get<Transfer>(`${v1}/transfers/${id}`),
    update: (id: string, body: In<typeof S.updateTransferBody>) => http.put<Transfer>(`${v1}/transfers/${id}`, body),
    remove: (id: string) => http.delete<{ ok: true }>(`${v1}/transfers/${id}`),
  },

  cards: {
    list: (includeArchived = false) => http.get<List<Card>>(`${v1}/cards`, { query: { includeArchived } }),
    get: (id: string) => http.get<Card>(`${v1}/cards/${id}`),
    create: (body: In<typeof S.createCardBody>) => http.post<Card>(`${v1}/cards`, body),
    update: (id: string, body: In<typeof S.updateCardBody>) => http.put<Card>(`${v1}/cards/${id}`, body),
    remove: (id: string) => http.delete<{ ok: true }>(`${v1}/cards/${id}`),
    invoices: (id: string, params: { period?: "all" | "upcoming" | "history"; cursor?: string; limit?: number } = {}) =>
      http.get<Page<Invoice>>(`${v1}/cards/${id}/invoices`, { query: params }),
    invoice: (id: string, invoiceId: string) => http.get<InvoiceDetail>(`${v1}/cards/${id}/invoices/${invoiceId}`),
    payInvoice: (id: string, invoiceId: string, body: In<typeof S.payInvoiceBody>) =>
      http.post<InvoicePayment>(`${v1}/cards/${id}/invoices/${invoiceId}/payments`, body),
    removePayment: (id: string, invoiceId: string, paymentId: string) =>
      http.delete<{ ok: true }>(`${v1}/cards/${id}/invoices/${invoiceId}/payments/${paymentId}`),
    installments: (id: string) => http.get<List<InstallmentPlan>>(`${v1}/cards/${id}/installments`),
  },

  recurring: {
    list: () => http.get<List<RecurringRule>>(`${v1}/recurring`),
    upcoming: (days = 30) => http.get<List<Upcoming>>(`${v1}/recurring/upcoming`, { query: { days } }),
    create: (body: In<typeof S.createRecurringBody>) => http.post<RecurringRule>(`${v1}/recurring`, body),
    update: (id: string, body: In<typeof S.updateRecurringBody>) => http.put<RecurringRule>(`${v1}/recurring/${id}`, body),
    remove: (id: string) => http.delete<{ ok: true }>(`${v1}/recurring/${id}`),
  },

  budgets: {
    list: (month?: string) => http.get<BudgetsOverview>(`${v1}/budgets`, { query: { month } }),
    upsert: (body: In<typeof S.upsertBudgetBody>) => http.post<Budget>(`${v1}/budgets`, body),
    update: (id: string, body: In<typeof S.updateBudgetBody>) => http.put<Budget>(`${v1}/budgets/${id}`, body),
    remove: (id: string) => http.delete<{ ok: true }>(`${v1}/budgets/${id}`),
    copy: (fromMonth: string, toMonth: string, overwrite = false) =>
      http.post<{ created: number; skipped: number }>(`${v1}/budgets/copy`, { fromMonth, toMonth, overwrite }),
  },

  goals: {
    list: (status?: "ACTIVE" | "ACHIEVED" | "ARCHIVED") => http.get<List<Goal>>(`${v1}/goals`, { query: { status } }),
    get: (id: string) => http.get<GoalDetail>(`${v1}/goals/${id}`),
    create: (body: In<typeof S.createGoalBody>) => http.post<Goal>(`${v1}/goals`, body),
    update: (id: string, body: In<typeof S.updateGoalBody>) => http.put<Goal>(`${v1}/goals/${id}`, body),
    remove: (id: string) => http.delete<{ ok: true }>(`${v1}/goals/${id}`),
    contribute: (id: string, body: In<typeof S.addContributionBody>) => http.post<Goal>(`${v1}/goals/${id}/contributions`, body),
    removeContribution: (id: string, contributionId: string) => http.delete<Goal>(`${v1}/goals/${id}/contributions/${contributionId}`),
  },

  notifications: {
    list: (params: { unreadOnly?: boolean; cursor?: string; limit?: number } = {}) => http.get<Page<AppNotification>>(`${v1}/notifications`, { query: params }),
    unreadCount: () => http.get<{ count: number }>(`${v1}/notifications/unread-count`),
    markRead: (id: string) => http.patch<AppNotification>(`${v1}/notifications/${id}/read`),
    markAllRead: () => http.post<{ ok: true }>(`${v1}/notifications/read-all`),
  },

  // Assinatura: estado, pagamento (página do provedor), portal, adicional. Preços vêm do provedor, nunca do app.
  billing: {
    get: () => http.get<Billing>(`${v1}/billing`),
    checkout: (investments: boolean, interval: S.BillingIntervalName) => http.post<Checkout>(`${v1}/billing/checkout`, { investments, interval }),
    portal: () => http.post<{ url: string }>(`${v1}/billing/portal`),
    addon: (enabled: boolean) => http.post<Billing>(`${v1}/billing/addon`, { enabled }),
  },

  // Só administradores (o servidor confere o papel a cada chamada). Metadados de conta e números agregados; nada financeiro.
  admin: {
    stats: () => http.get<AdminStats>(`${v1}/admin/stats`),
    integrations: () => http.get<AdminIntegrations>(`${v1}/admin/integrations`),
    users: (params: { search?: string; cursor?: string; limit?: number } = {}) => http.get<Page<AdminUser>>(`${v1}/admin/users`, { query: params }),
    user: (id: string) => http.get<AdminUserDetail>(`${v1}/admin/users/${id}`),
    /** Cortesia: `days: null` = sem prazo. */
    grantAccess: (id: string, body: { days: number | null; investments: boolean }) => http.post<AdminUser>(`${v1}/admin/users/${id}/access`, body),
    revokeAccess: (id: string) => http.delete<AdminUser>(`${v1}/admin/users/${id}/access`),
    /** Exclusão definitiva da conta de outra pessoa (como o pedido LGPD). */
    deleteUser: (id: string) => http.delete<{ ok: true }>(`${v1}/admin/users/${id}`, { body: { confirm: "EXCLUIR" } }),
    setStatus: (id: string, status: "ACTIVE" | "SUSPENDED") => http.patch<AdminUser>(`${v1}/admin/users/${id}`, { status }),
    setRole: (id: string, role: "USER" | "ADMIN") => http.post<AdminUser>(`${v1}/admin/users/${id}/role`, { role }),
    sendPasswordReset: (id: string) => http.post<{ ok: true }>(`${v1}/admin/users/${id}/password-reset`),
    extendTrial: (id: string, days: number) => http.post<AdminUser>(`${v1}/admin/users/${id}/trial`, { days }),
    removeMfa: (id: string) => http.delete<AdminUser>(`${v1}/admin/users/${id}/mfa`),
    audit: (params: { cursor?: string; limit?: number } = {}) => http.get<Page<AdminAuditEntry>>(`${v1}/admin/audit`, { query: params }),
  },

  diagnostics: {
    report: (body: S.ClientErrorReportBody) => http.post<{ accepted: number }>(`${v1}/diagnostics/client-errors`, body),
  },

  openFinance: {
    status: () => http.get<OpenFinanceStatus>(`${v1}/open-finance/status`),
    connectors: () => http.get<{ data: { id: number; name: string }[] }>(`${v1}/open-finance/connectors`),
    connectToken: (connectionId?: string) =>
      http.post<ConnectToken>(`${v1}/open-finance/connect-token`, { connectionId, platform: Platform.OS === "web" ? "web" : "native" }),
    register: (itemId: string, autoImport?: boolean) => http.post<BankConnection>(`${v1}/open-finance/connections`, { itemId, autoImport }),
    setAutoImport: (id: string, autoImport: boolean) => http.patch<BankConnection>(`${v1}/open-finance/connections/${id}`, { autoImport }),
    refresh: (id: string) => http.post<{ requested: true; refreshesLeftToday: number }>(`${v1}/open-finance/connections/${id}/refresh`),
    investments: (includeClosed = false) => http.get<InvestmentsOverview>(`${v1}/open-finance/investments`, { query: { includeClosed } }),
    investment: (id: string) => http.get<InvestmentDetail>(`${v1}/open-finance/investments/${id}`),
    overview: () => http.get<BankOverview>(`${v1}/open-finance/overview`),
    connections: () => http.get<List<BankConnection>>(`${v1}/open-finance/connections`),
    remove: (id: string) => http.delete<{ ok: true }>(`${v1}/open-finance/connections/${id}`),
    sync: (id: string) => http.post<{ newTransactions: number; accounts: number; investments: number; status: string }>(`${v1}/open-finance/connections/${id}/sync`),
    link: (id: string, providerAccountId: string, target: { accountId?: string | null; cardId?: string | null }) =>
      http.put<BankConnection>(`${v1}/open-finance/connections/${id}/accounts/${encodeURIComponent(providerAccountId)}`, target),
    bankTransactions: (params: { status?: "NEW" | "IGNORED" | "IMPORTED" | "MATCHED"; cursor?: string; limit?: number }) =>
      http.get<Page<BankTransaction>>(`${v1}/open-finance/bank-transactions`, { query: params }),
    importTx: (id: string, body: { categoryId?: string | null; description?: string }) =>
      http.post<{ transactionId: string }>(`${v1}/open-finance/bank-transactions/${id}/import`, body),
    matchTx: (id: string, transactionId: string) => http.post<{ ok: true }>(`${v1}/open-finance/bank-transactions/${id}/match`, { transactionId }),
    ignoreTx: (id: string) => http.post<{ ok: true }>(`${v1}/open-finance/bank-transactions/${id}/ignore`),
    restoreTx: (id: string) => http.post<{ ok: true }>(`${v1}/open-finance/bank-transactions/${id}/restore`),
  },

  reports: {
    categoryBreakdown: (p: ReportParams & { type?: "EXPENSE" | "INCOME" }) => http.get<CategoryBreakdown>(`${v1}/reports/category-breakdown`, { query: p }),
    incomeVsExpense: (p: ReportParams & { granularity?: "week" | "month" }) => http.get<IncomeVsExpense>(`${v1}/reports/income-vs-expense`, { query: p }),
    balanceEvolution: (p: ReportParams) => http.get<BalanceEvolution>(`${v1}/reports/balance-evolution`, { query: p }),
    cashFlow: (p: ReportParams & { granularity?: "week" | "month" }) => http.get<CashFlow>(`${v1}/reports/cash-flow`, { query: p }),
    monthComparison: (month?: string) => http.get<MonthComparison>(`${v1}/reports/month-comparison`, { query: { month } }),
  },
};

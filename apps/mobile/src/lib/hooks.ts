import { todayIn, type ISODate } from "@app/shared";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { randomUUID } from "expo-crypto";
import { errorText } from "@/components/ui/ApiErrorMessage";
import { billingWithDefaults } from "./access";
import { ApiError } from "./api/client";
import { api, type CreateTransactionInput, type ReportParams, type TransactionFilters } from "./api/endpoints";
import { useAuth } from "./auth/AuthProvider";
import { flushOutbox, useOutbox } from "./offline/outbox";
import { toast } from "./ui-store";

/** "Hoje" no fuso do perfil do usuário (datas de calendário, sem hora). */
export function useToday(): ISODate {
  const { me } = useAuth();
  return todayIn(me?.profile.timezone ?? "America/Sao_Paulo");
}

// ------------------------------------------------------------------ consultas

export const useDashboard = () => useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });
export const useBanks = () => useQuery({ queryKey: ["banks"], queryFn: api.banks, staleTime: 24 * 3600_000 });

export const useCategories = (type?: "EXPENSE" | "INCOME", includeArchived = false) =>
  useQuery({ queryKey: ["categories", type, includeArchived], queryFn: () => api.categories.list({ type, includeArchived }) });

export const useAccounts = (includeArchived = false) =>
  useQuery({ queryKey: ["accounts", includeArchived], queryFn: () => api.accounts.list(includeArchived) });
export const useAccount = (id: string) => useQuery({ queryKey: ["account", id], queryFn: () => api.accounts.get(id) });

export const useCards = (includeArchived = false) =>
  useQuery({ queryKey: ["cards", includeArchived], queryFn: () => api.cards.list(includeArchived) });
export const useCard = (id: string) => useQuery({ queryKey: ["card", id], queryFn: () => api.cards.get(id) });
export const useInvoices = (cardId: string, period: "all" | "upcoming" | "history") =>
  useQuery({ queryKey: ["invoices", cardId, period], queryFn: () => api.cards.invoices(cardId, { period, limit: 24 }) });
export const useInvoice = (cardId: string, invoiceId: string) =>
  useQuery({ queryKey: ["invoice", cardId, invoiceId], queryFn: () => api.cards.invoice(cardId, invoiceId) });
export const useInstallments = (cardId: string) =>
  useQuery({ queryKey: ["installments", cardId], queryFn: () => api.cards.installments(cardId) });

export function useTransactions(filters: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: ["transactions", filters],
    queryFn: ({ pageParam }) => api.transactions.list({ ...filters, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}
export const useTransactionSummary = (filters: TransactionFilters) =>
  useQuery({ queryKey: ["transactions-summary", filters], queryFn: () => api.transactions.summary(filters), placeholderData: keepPreviousData });
export const useTransaction = (id: string | undefined) =>
  useQuery({ queryKey: ["transaction", id], queryFn: () => api.transactions.get(id!), enabled: !!id });

export const useBudgets = (month?: string) => useQuery({ queryKey: ["budgets", month], queryFn: () => api.budgets.list(month) });
export const useGoals = (status?: "ACTIVE" | "ACHIEVED" | "ARCHIVED") =>
  useQuery({ queryKey: ["goals", status], queryFn: () => api.goals.list(status) });
export const useGoal = (id: string) => useQuery({ queryKey: ["goal", id], queryFn: () => api.goals.get(id) });
export const useRecurring = () => useQuery({ queryKey: ["recurring"], queryFn: api.recurring.list });
export const useUpcoming = (days = 30) => useQuery({ queryKey: ["upcoming", days], queryFn: () => api.recurring.upcoming(days) });

export const useNotifications = () =>
  useInfiniteQuery({
    queryKey: ["notifications"],
    queryFn: ({ pageParam }) => api.notifications.list({ cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
  });
export const useUnreadCount = () =>
  useQuery({ queryKey: ["unread"], queryFn: api.notifications.unreadCount, refetchInterval: 60_000 });

/** Insígnias da pessoa (a leitura já avalia e grava os níveis novos). */
export const useBadges = () => useQuery({ queryKey: ["badges"], queryFn: api.badges.list, staleTime: 15_000 });

export const useConsents = () => useQuery({ queryKey: ["consents"], queryFn: api.privacy.consents });

/** Assinatura: estado, preços e o que dá para fazer. `poll` relê de 2 em 2 s (volta do pagamento, enquanto o provedor confirma). */
export const useBilling = (poll = false) =>
  useQuery({ queryKey: ["billing"], queryFn: api.billing.get, refetchInterval: poll ? 2_000 : false, retry: planRetry, select: billingWithDefaults });

// ------------------------------------------------------------------ administração (só para administradores)

/** `enabled` evita qualquer chamada quando a pessoa não é administradora (a tela também nem é mostrada). */
export const useAdminStats = (enabled = true) => useQuery({ queryKey: ["admin", "stats"], queryFn: api.admin.stats, enabled, refetchInterval: 60_000 });
export const useAdminIntegrations = (enabled = true) => useQuery({ queryKey: ["admin", "integrations"], queryFn: api.admin.integrations, enabled });
export const useAdminUsers = (search: string, enabled = true) =>
  useInfiniteQuery({
    queryKey: ["admin", "users", search],
    queryFn: ({ pageParam }) => api.admin.users({ search: search || undefined, cursor: pageParam, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    enabled,
  });
/** Atividade dos administradores (quem fez o quê, em qual conta, quando), do mais recente para o mais antigo. */
export const useAdminAudit = (enabled = true) =>
  useInfiniteQuery({
    queryKey: ["admin", "audit"],
    queryFn: ({ pageParam }) => api.admin.audit({ cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
    enabled,
  });
export const useAdminUser = (id: string | null) => useQuery({ queryKey: ["admin", "user", id], queryFn: () => api.admin.user(id!), enabled: !!id });

/** Sem insistir: se o servidor não responder, a tela segue como "Open Finance desligado" em vez de ficar carregando (1 nova tentativa só). */
export const useOpenFinanceStatus = () => useQuery({ queryKey: ["of-status"], queryFn: api.openFinance.status, retry: 1, retryDelay: 800 });

/**
 * Para onde levar quem toca em "conectar banco": a tela real só quando o recurso está ligado no servidor; senão, a explicação "em breve"
 * do mural (a conexão com bancos ainda não foi lançada para o público).
 */
export function useBankEntry(): { enabled: boolean; href: string } {
  const enabled = useOpenFinanceStatus().data?.enabled === true;
  return { enabled, href: enabled ? "/open-finance" : "/updates?item=bank-connection" };
}
/** `enabled = false` não faz chamada nenhuma (ex.: o Open Finance está desligado, então não há conexões para buscar). */
export const useBankConnections = (enabled = true) => useQuery({ queryKey: ["of-connections"], queryFn: api.openFinance.connections, enabled });

/**
 * Investimentos vindos do banco. Relê do servidor a cada minuto enquanto a tela está aberta: o servidor já
 * atualiza sozinho (webhook do provedor + rotina periódica), então isto só traz o que ele já guardou.
 */
export const useInvestments = (enabled = true) =>
  useQuery({ queryKey: ["of-investments"], queryFn: () => api.openFinance.investments(), refetchInterval: enabled ? 60_000 : false, enabled });
export const useInvestment = (id: string | undefined) =>
  useQuery({ queryKey: ["of-investment", id], queryFn: () => api.openFinance.investment(id!), enabled: !!id, refetchInterval: 60_000 });
/** Saldo, limite e fatura informados pelo banco para as contas/cartões já vinculados. */
export const useBankOverview = () => useQuery({ queryKey: ["of-overview"], queryFn: api.openFinance.overview, refetchInterval: 60_000 });

/**
 * Ao abrir a tela, pede ao servidor uma releitura das conexões cujos dados estão velhos (mais de `maxAgeMinutes`).
 * É só leitura do que o provedor já guardou (não consome a cota mensal do Open Finance) e roda uma vez por abertura.
 */
export function useSyncStaleConnections(maxAgeMinutes = 30, enabled = true) {
  const qc = useQueryClient();
  const connections = useBankConnections(enabled);
  const done = useRef(false);
  useEffect(() => {
    const list = connections.data?.data;
    if (done.current || !list) return;
    done.current = true;
    const limit = Date.now() - maxAgeMinutes * 60_000;
    const stale = list.filter((c) => c.status !== "REVOKED" && (!c.lastSyncAt || new Date(c.lastSyncAt).getTime() < limit));
    if (stale.length === 0) return;
    void (async () => {
      for (const c of stale) {
        try {
          await api.openFinance.sync(c.id);
        } catch {
          /* sem rede/limite: segue com o que já há */
        }
      }
      void qc.invalidateQueries();
    })();
  }, [connections.data, maxAgeMinutes, qc]);
}
export const useBankTransactions = (status: "NEW" | "IGNORED") =>
  useInfiniteQuery({
    queryKey: ["of-bank-transactions", status],
    queryFn: ({ pageParam }) => api.openFinance.bankTransactions({ status, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
  });

// relatórios
export const useCategoryBreakdown = (p: ReportParams, type: "EXPENSE" | "INCOME" = "EXPENSE") =>
  useQuery({ queryKey: ["report", "categories", p, type], queryFn: () => api.reports.categoryBreakdown({ ...p, type }), placeholderData: keepPreviousData, retry: planRetry });
export const useIncomeVsExpense = (p: ReportParams, granularity?: "week" | "month") =>
  useQuery({ queryKey: ["report", "income-vs-expense", p, granularity], queryFn: () => api.reports.incomeVsExpense({ ...p, granularity }), placeholderData: keepPreviousData, retry: planRetry });
export const useBalanceEvolution = (p: ReportParams) =>
  useQuery({ queryKey: ["report", "balance", p], queryFn: () => api.reports.balanceEvolution(p), placeholderData: keepPreviousData, retry: planRetry });
export const useCashFlow = (p: ReportParams, granularity?: "week" | "month") =>
  useQuery({ queryKey: ["report", "cash-flow", p, granularity], queryFn: () => api.reports.cashFlow({ ...p, granularity }), placeholderData: keepPreviousData, retry: planRetry });
export const useMonthComparison = (month?: string) =>
  useQuery({ queryKey: ["report", "month-comparison", month], queryFn: () => api.reports.monthComparison(month) });

/** 402 (recurso Premium) não adianta repetir. */
function planRetry(count: number, error: unknown) {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return count < 2;
}

// ------------------------------------------------------------------ mutações

/**
 * Mutação padrão: ao concluir, revalida os dados (as telas se interligam: um lançamento muda
 * saldo, orçamento, gráficos...), mostra aviso e traduz o erro para o usuário.
 */
export function useApiMutation<TVars, TData>(
  fn: (vars: TVars) => Promise<TData>,
  opts: { success?: string; onSuccess?: (data: TData, vars: TVars) => void; silent?: boolean } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      void qc.invalidateQueries();
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(data, vars);
    },
    onError: (error) => {
      if (!opts.silent) toast.error(errorText(error));
    },
  });
}

/**
 * Cria lançamento. Sem conexão, o lançamento entra na fila offline (UUID gerado aqui) e é
 * enviado quando a rede voltar, sem risco de duplicar.
 */
export function useCreateTransaction(onDone?: (queued: boolean) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTransactionInput) => {
      const id = input.id ?? randomUUID();
      const body = { ...input, id };
      try {
        await api.transactions.create(body, id);
        return { queued: false };
      } catch (err) {
        if (err instanceof ApiError && err.isNetwork) {
          useOutbox.getState().enqueue({ id, kind: "transaction", body: body as Record<string, unknown> });
          return { queued: true };
        }
        throw err;
      }
    },
    onSuccess: ({ queued }) => {
      void qc.invalidateQueries();
      if (queued) toast.info("Sem conexão: o lançamento foi salvo e será enviado quando a internet voltar.");
      else toast.success("Lançamento salvo");
      onDone?.(queued);
      if (!queued) void flushOutbox();
    },
    onError: (error) => toast.error(errorText(error)),
  });
}

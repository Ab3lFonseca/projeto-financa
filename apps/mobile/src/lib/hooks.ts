import { todayIn, type ISODate } from "@app/shared";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { errorText } from "@/components/ui/ApiErrorMessage";
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

export const useConsents = () => useQuery({ queryKey: ["consents"], queryFn: api.privacy.consents });

export const useOpenFinanceStatus = () => useQuery({ queryKey: ["of-status"], queryFn: api.openFinance.status });
export const useBankConnections = () => useQuery({ queryKey: ["of-connections"], queryFn: api.openFinance.connections });
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

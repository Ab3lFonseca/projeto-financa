import { router } from "expo-router";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Divider, IconBadge, ListRow, Screen, ScreenHeader } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { api, type AppNotification } from "@/lib/api/endpoints";
import { useApiMutation, useNotifications } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeProvider";

const ICON: Record<AppNotification["type"], { icon: string; tone: "primary" | "warning" | "negative" | "positive" }> = {
  BILL_DUE: { icon: "calendar-clock", tone: "warning" },
  INVOICE_DUE: { icon: "credit-card", tone: "warning" },
  BUDGET_NEAR_LIMIT: { icon: "triangle-alert", tone: "warning" },
  BUDGET_EXCEEDED: { icon: "circle-alert", tone: "negative" },
  GOAL_PROGRESS: { icon: "target", tone: "primary" },
  GOAL_ACHIEVED: { icon: "trophy", tone: "positive" },
  TRANSACTION_SYNCED: { icon: "cloud-check", tone: "positive" },
  SYNC_FAILED: { icon: "cloud-off", tone: "negative" },
  SYSTEM: { icon: "bell", tone: "primary" },
};

/** Destino ao tocar: leva para a tela relacionada ao aviso. */
function routeFor(n: AppNotification): string | null {
  const d = (n.data ?? {}) as Record<string, string | undefined>;
  switch (n.type) {
    case "INVOICE_DUE":
      return d.cardId && d.invoiceId ? `/card/${d.cardId}/invoice/${d.invoiceId}` : "/wallet";
    case "BILL_DUE":
      return d.transactionId ? `/transaction/${d.transactionId}` : "/recurring";
    case "BUDGET_NEAR_LIMIT":
    case "BUDGET_EXCEEDED":
      return "/budgets";
    case "GOAL_PROGRESS":
    case "GOAL_ACHIEVED":
      return d.goalId ? `/goals/${d.goalId}` : "/goals";
    case "TRANSACTION_SYNCED":
      return "/open-finance/review";
    case "SYNC_FAILED":
      return "/open-finance";
    default:
      return null;
  }
}

function when(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  if (days < 7) return `há ${days} d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const q = useNotifications();
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  const read = useApiMutation((id: string) => api.notifications.markRead(id), { silent: true });
  const readAll = useApiMutation(() => api.notifications.markAllRead(), { success: "Tudo marcado como lido" });

  const tint = { primary: colors.primary, warning: colors.warning, negative: colors.negative, positive: colors.positive };

  return (
    <Screen
      refreshing={q.isRefetching}
      onRefresh={() => void q.refetch()}
      header={<ScreenHeader title="Notificações" right={unread > 0 ? <Button label="Marcar lidas" variant="ghost" size="sm" fullWidth={false} loading={readAll.isPending} onPress={() => readAll.mutate(undefined)} /> : undefined} />}
    >
      {q.isLoading && !q.data ? (
        <SkeletonCard lines={5} />
      ) : q.isError && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon="bell" title="Tudo em dia" message="Avisos de vencimento, orçamento e metas aparecem aqui." />
        </Card>
      ) : (
        <>
          <Card style={{ paddingVertical: 6 }}>
            {items.map((n, i) => {
              const meta = ICON[n.type] ?? ICON.SYSTEM;
              const target = routeFor(n);
              return (
                <View key={n.id}>
                  {i > 0 ? <Divider inset={52} /> : null}
                  <ListRow
                    title={n.title}
                    subtitle={n.body}
                    left={<IconBadge icon={meta.icon} color={tint[meta.tone]} size={36} />}
                    right={
                      <View style={{ alignItems: "flex-end", gap: 6 }}>
                        <Text variant="caption" tone="faint">
                          {when(n.createdAt)}
                        </Text>
                        {!n.readAt ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
                      </View>
                    }
                    onPress={() => {
                      if (!n.readAt) read.mutate(n.id);
                      if (target) router.push(target as never);
                    }}
                  />
                </View>
              );
            })}
          </Card>
          {q.hasNextPage ? <Button label="Carregar mais" variant="secondary" loading={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()} /> : null}
        </>
      )}
    </Screen>
  );
}

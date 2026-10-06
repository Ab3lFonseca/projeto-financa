import { View } from "react-native";
import { AdminGate } from "@/components/AdminGate";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Divider, IconBadge, Screen, ScreenHeader } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { dateTimeBR } from "@/lib/account";
import { describeAdminAction } from "@/lib/admin";
import { formatAgo } from "@/lib/format";
import { useAdminAudit } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeProvider";

/** Atividade dos administradores: quem fez o quê, em qual conta e quando. Sem dado financeiro nem dado de pagamento. */
export default function AdminActivityScreen() {
  return (
    <AdminGate>
      <Activity />
    </AdminGate>
  );
}

function Activity() {
  const { colors } = useTheme();
  const query = useAdminAudit();
  const entries = query.data?.pages.flatMap((p) => p.data) ?? [];
  const tone = { default: colors.primary, positive: colors.positive, negative: colors.negative, warning: colors.warning, primary: colors.accent };

  return (
    <Screen header={<ScreenHeader title="Atividade" subtitle="O que os administradores fizeram" backTo="/admin" />} refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()}>
      {query.isLoading && !query.data ? (
        <SkeletonCard lines={5} />
      ) : query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState icon="file-text" title="Nenhuma atividade ainda" message="As ações dos administradores aparecem aqui." />
        </Card>
      ) : (
        <>
          <Card style={{ paddingVertical: 6 }}>
            {entries.map((e, i) => {
              const look = describeAdminAction(e.action);
              const who = e.actor.label ?? "Alguém";
              const target = e.target ? (e.target.label ?? "conta já excluída") : null;
              return (
                <View key={e.id}>
                  {i > 0 ? <Divider inset={52} /> : null}
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 12 }}>
                    <IconBadge icon={look.icon} color={tone[look.tone]} size={38} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text weight="600">
                        {who} <Text weight="400" tone="muted">{look.verb}</Text>
                        {target ? ` ${target}` : ""}
                      </Text>
                      {e.detail ? (
                        <Text variant="caption" tone="muted">
                          {e.detail}
                        </Text>
                      ) : null}
                      <Text variant="caption" tone="faint">
                        {dateTimeBR(e.at)} · {formatAgo(e.at)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </Card>
          {query.hasNextPage ? <Button label="Carregar mais" variant="secondary" loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}
        </>
      )}
    </Screen>
  );
}

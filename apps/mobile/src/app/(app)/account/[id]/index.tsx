import { ACCOUNT_TYPE_LABEL_PT } from "@app/shared";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { TransactionRow } from "@/components/feature/Rows";
import { Badge } from "@/components/ui/Controls";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Divider, IconBadge, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { Text } from "@/components/ui/Text";
import { api } from "@/lib/api/endpoints";
import { useAccount, useApiMutation } from "@/lib/hooks";
import { confirmDialog } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/wallet" as never);
}

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data: account, isLoading, error, refetch, isRefetching } = useAccount(id);
  const archive = useApiMutation((archived: boolean) => api.accounts.update(id!, { archived }), { success: "Conta atualizada" });
  const remove = useApiMutation(() => api.accounts.remove(id!), { success: "Conta excluída", onSuccess: goBack });

  if (!account) {
    return (
      <Screen header={<ScreenHeader title="Conta" />}>
        {isLoading ? <SkeletonCard /> : <ErrorState error={error} onRetry={() => void refetch()} />}
      </Screen>
    );
  }

  const tint = account.color ?? colors.primary;
  return (
    <Screen
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      header={<ScreenHeader title={account.name} subtitle={account.bank?.name ?? ACCOUNT_TYPE_LABEL_PT[account.type]} right={<IconButton icon="pencil" label="Editar" onPress={() => router.push(`/account/${id}/edit` as never)} />} />}
    >
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <IconBadge icon={account.type === "WALLET" ? "wallet" : account.type === "INVESTMENT" ? "trending-up" : "landmark"} color={tint} />
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="muted">
              Saldo atual
            </Text>
            <Money cents={account.balanceCents} variant="title" weight="700" tone={account.balanceCents < 0 ? "negative" : undefined} />
          </View>
          {account.archived ? <Badge label="Arquivada" /> : null}
          {!account.includeInTotal ? <Badge label="Fora do total" tone="warning" /> : null}
        </View>
      </Card>

      <Section title="Últimas movimentações" action="Ver todas" onAction={() => router.push("/transactions" as never)}>
        <Card style={{ paddingVertical: 4 }}>
          {account.recentTransactions.length === 0 ? (
            <EmptyState icon="receipt" title="Sem movimentações" message="Os lançamentos desta conta aparecem aqui." />
          ) : (
            account.recentTransactions.map((t, i) => (
              <View key={t.id}>
                {i > 0 ? <Divider inset={52} /> : null}
                <TransactionRow tx={t} showDate onPress={() => router.push(`/transaction/${t.id}` as never)} />
              </View>
            ))
          )}
        </Card>
      </Section>

      <View style={{ gap: 8 }}>
        <Button label={account.archived ? "Desarquivar conta" : "Arquivar conta"} variant="secondary" loading={archive.isPending} onPress={() => archive.mutate(!account.archived)} />
        <Button
          label="Excluir conta"
          variant="danger"
          loading={remove.isPending}
          onPress={async () => {
            const ok = await confirmDialog({ title: "Excluir conta?", message: "Só é possível excluir contas sem movimentações. Se houver histórico, arquive a conta.", confirmLabel: "Excluir", destructive: true });
            if (ok) remove.mutate(undefined);
          }}
        />
      </View>
    </Screen>
  );
}

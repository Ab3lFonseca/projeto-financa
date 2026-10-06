import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Badge, Segmented } from "@/components/ui/Controls";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Divider, IconBadge, ListRow, Screen, ScreenHeader } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { api, type RecurringRule } from "@/lib/api/endpoints";
import { formatDateRelative } from "@/lib/format";
import { useApiMutation, useRecurring, useToday, useUpcoming } from "@/lib/hooks";
import { confirmDialog } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";

type Tab = "UPCOMING" | "RULES";
const FREQ: Record<RecurringRule["frequency"], string> = { WEEKLY: "Semanal", MONTHLY: "Mensal", YEARLY: "Anual" };

export default function RecurringScreen() {
  const { colors } = useTheme();
  const today = useToday();
  const [tab, setTab] = useState<Tab>("UPCOMING");
  const [selected, setSelected] = useState<RecurringRule | null>(null);
  const rules = useRecurring();
  const upcoming = useUpcoming(45);

  const toggle = useApiMutation((r: RecurringRule) => api.recurring.update(r.id, { active: !r.active }), {
    success: "Recorrência atualizada",
    onSuccess: () => setSelected(null),
  });
  const remove = useApiMutation((id: string) => api.recurring.remove(id), { success: "Recorrência excluída", onSuccess: () => setSelected(null) });

  const query = tab === "RULES" ? rules : upcoming;
  const ruleList = rules.data?.data ?? [];
  const upcomingList = upcoming.data?.data ?? [];

  return (
    <Screen
      refreshing={query.isRefetching}
      onRefresh={() => {
        void rules.refetch();
        void upcoming.refetch();
      }}
      header={<ScreenHeader title="Recorrências" right={<Button label="Nova" icon="plus" size="sm" fullWidth={false} onPress={() => router.push("/recurring/new" as never)} />} />}
    >
      <Segmented<Tab> options={[{ value: "UPCOMING", label: "Próximas contas" }, { value: "RULES", label: "Minhas regras" }]} value={tab} onChange={setTab} />

      {query.isLoading && !query.data ? (
        <SkeletonCard lines={5} />
      ) : query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : tab === "UPCOMING" ? (
        upcomingList.length === 0 ? (
          <Card>
            <EmptyState icon="calendar-clock" title="Nada previsto nos próximos 45 dias" message="Cadastre aluguel, salário e assinaturas como recorrências para ver o que vem por aí." action="Nova recorrência" onAction={() => router.push("/recurring/new" as never)} />
          </Card>
        ) : (
          <Card style={{ paddingVertical: 6 }}>
            {upcomingList.map((u, i) => (
              <View key={`${u.ruleId}-${u.date}`}>
                {i > 0 ? <Divider inset={52} /> : null}
                <ListRow
                  title={u.description}
                  subtitle={formatDateRelative(u.date, today)}
                  left={<IconBadge icon={u.category?.icon ?? (u.type === "INCOME" ? "arrow-down-left" : "arrow-up-right")} color={u.category?.color ?? (u.type === "INCOME" ? colors.positive : colors.negative)} size={36} />}
                  right={<Money cents={u.type === "INCOME" ? u.amountCents : -u.amountCents} signed colorize variant="bodySm" />}
                />
              </View>
            ))}
          </Card>
        )
      ) : ruleList.length === 0 ? (
        <Card>
          <EmptyState icon="repeat" title="Nenhuma recorrência" message="Automatize o que se repete todo mês." action="Nova recorrência" onAction={() => router.push("/recurring/new" as never)} />
        </Card>
      ) : (
        <Card style={{ paddingVertical: 6 }}>
          {ruleList.map((r, i) => (
            <View key={r.id}>
              {i > 0 ? <Divider inset={52} /> : null}
              <ListRow
                title={r.description}
                subtitle={`${FREQ[r.frequency]} · próxima em ${formatDateRelative(r.nextRunOn, today)}`}
                left={<IconBadge icon={r.category?.icon ?? "repeat"} color={r.category?.color ?? colors.primary} size={36} />}
                right={
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Money cents={r.type === "INCOME" ? r.amountCents : -r.amountCents} signed colorize variant="bodySm" />
                    {!r.active ? <Badge label="Pausada" tone="warning" /> : null}
                  </View>
                }
                onPress={() => setSelected(r)}
              />
            </View>
          ))}
        </Card>
      )}

      <Sheet visible={selected !== null} onClose={() => setSelected(null)} title={selected?.description}>
        {selected ? (
          <View style={{ gap: 12 }}>
            <Text tone="muted">
              {FREQ[selected.frequency]} · {selected.account?.name ?? selected.card?.name ?? "—"}
              {selected.dayOfMonth ? ` · dia ${selected.dayOfMonth}` : ""}
            </Text>
            <Button label={selected.active ? "Pausar" : "Retomar"} variant="secondary" loading={toggle.isPending} onPress={() => toggle.mutate(selected)} />
            <Button
              label="Excluir recorrência"
              variant="danger"
              loading={remove.isPending}
              onPress={async () => {
                if (await confirmDialog({ title: "Excluir recorrência?", message: "Os lançamentos já criados continuam no histórico.", confirmLabel: "Excluir", destructive: true })) remove.mutate(selected.id);
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

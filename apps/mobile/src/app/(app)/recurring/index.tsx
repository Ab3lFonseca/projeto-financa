import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Badge, Segmented } from "@/components/ui/Controls";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { DateField } from "@/components/ui/DateField";
import { Card, Divider, IconBadge, ListRow, Screen, ScreenHeader } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { api, type RecurringRule } from "@/lib/api/endpoints";
import { formatDateRelative, formatDateShort } from "@/lib/format";
import { cadenceText, endText, KIND_LABEL } from "@/lib/recurring";
import { useApiMutation, useRecurring, useToday, useUpcoming } from "@/lib/hooks";
import { confirmDialog } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";

type Tab = "UPCOMING" | "RULES";

/** Ícone e cor da linha: a categoria quando há; senão pelo tipo (receita, despesa ou transferência). */
function kindLook(type: RecurringRule["type"], colors: { positive: string; negative: string; primary: string }) {
  if (type === "TRANSFER") return { icon: "arrow-left-right", color: colors.primary };
  return type === "INCOME" ? { icon: "arrow-down-left", color: colors.positive } : { icon: "arrow-up-right", color: colors.negative };
}

export default function RecurringScreen() {
  const { colors } = useTheme();
  const today = useToday();
  const [tab, setTab] = useState<Tab>("UPCOMING");
  const [selected, setSelected] = useState<RecurringRule | null>(null);
  const [editingEnd, setEditingEnd] = useState(false);
  const rules = useRecurring();
  const upcoming = useUpcoming(45);

  const close = () => {
    setSelected(null);
    setEditingEnd(false);
  };
  const toggle = useApiMutation((r: RecurringRule) => api.recurring.update(r.id, { active: !r.active }), {
    success: "Recorrência atualizada",
    onSuccess: close,
  });
  // O fim vale para as próximas ocorrências; o que já foi gerado não muda.
  const setEnd = useApiMutation((v: { id: string; endDate: string | null }) => api.recurring.update(v.id, { endDate: v.endDate }), {
    success: "Fim atualizado",
    onSuccess: (rule) => {
      setSelected(rule);
      setEditingEnd(false);
    },
  });
  const remove = useApiMutation((id: string) => api.recurring.remove(id), { success: "Recorrência excluída", onSuccess: close });

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
            {upcomingList.map((u, i) => {
              const look = kindLook(u.type, colors);
              return (
                <View key={`${u.ruleId}-${u.date}`}>
                  {i > 0 ? <Divider inset={52} /> : null}
                  <ListRow
                    title={u.description}
                    subtitle={`${formatDateRelative(u.date, today)}${u.type === "TRANSFER" ? " · Transferência" : ""}`}
                    left={<IconBadge icon={u.category?.icon ?? look.icon} color={u.category?.color ?? look.color} size={36} />}
                    // transferência só muda o dinheiro de lugar: sem sinal nem cor de ganho ou perda
                    right={u.type === "TRANSFER" ? <Money cents={u.amountCents} variant="bodySm" /> : <Money cents={u.type === "INCOME" ? u.amountCents : -u.amountCents} signed colorize variant="bodySm" />}
                  />
                </View>
              );
            })}
          </Card>
        )
      ) : ruleList.length === 0 ? (
        <Card>
          <EmptyState icon="repeat" title="Nenhuma recorrência" message="Automatize o que se repete todo mês." action="Nova recorrência" onAction={() => router.push("/recurring/new" as never)} />
        </Card>
      ) : (
        <Card style={{ paddingVertical: 6 }}>
          {ruleList.map((r, i) => {
            const look = kindLook(r.type, colors);
            const finished = !r.active && r.endDate !== null && r.endDate <= today;
            return (
              <View key={r.id}>
                {i > 0 ? <Divider inset={52} /> : null}
                <ListRow
                  title={r.description}
                  subtitle={`${cadenceText(r.frequency, r.intervalCount)} · ${finished ? `terminou em ${formatDateShort(r.endDate!)}` : `próxima em ${formatDateRelative(r.nextRunOn, today)}`}`}
                  left={<IconBadge icon={r.category?.icon ?? (r.type === "EXPENSE" || r.type === "INCOME" ? "repeat" : look.icon)} color={r.category?.color ?? colors.primary} size={36} />}
                  right={
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      {r.type === "TRANSFER" ? <Money cents={r.amountCents} variant="bodySm" /> : <Money cents={r.type === "INCOME" ? r.amountCents : -r.amountCents} signed colorize variant="bodySm" />}
                      {finished ? <Badge label="Concluída" /> : !r.active ? <Badge label="Pausada" tone="warning" /> : null}
                    </View>
                  }
                  onPress={() => setSelected(r)}
                />
              </View>
            );
          })}
        </Card>
      )}

      <Sheet visible={selected !== null} onClose={close} title={selected?.description}>
        {selected ? (
          <View style={{ gap: 12 }}>
            <Text tone="muted">
              {selected.type === "TRANSFER" ? `${selected.account?.name ?? "—"} → ${selected.toAccount?.name ?? "—"}` : (selected.account?.name ?? selected.card?.name ?? "—")} · {KIND_LABEL[selected.type]}
            </Text>
            <Text tone="muted">
              {cadenceText(selected.frequency, selected.intervalCount)}
              {selected.dayOfMonth ? ` · dia ${selected.dayOfMonth}` : ""}
            </Text>
            <Text tone="muted">{endText(selected.endDate, formatDateShort)}</Text>
            {editingEnd ? (
              <DateField label="Termina em" value={selected.endDate ?? selected.nextRunOn} onChange={(endDate) => setEnd.mutate({ id: selected.id, endDate })} today={today} min={selected.startDate} />
            ) : (
              <Button label={selected.endDate ? "Mudar a data do fim" : "Definir uma data para acabar"} variant="secondary" onPress={() => setEditingEnd(true)} />
            )}
            {selected.endDate ? <Button label="Tirar a data do fim" variant="ghost" loading={setEnd.isPending} onPress={() => setEnd.mutate({ id: selected.id, endDate: null })} /> : null}
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

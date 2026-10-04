import type { ISODate } from "@app/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { GoalForm } from "@/components/feature/GoalForm";
import { GoalCard } from "@/components/feature/Rows";
import { Segmented } from "@/components/ui/Controls";
import { Button, IconButton } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { MoneyField, TextField } from "@/components/ui/Inputs";
import { Card, Divider, IconBadge, ListRow, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api/endpoints";
import { formatDateShort } from "@/lib/format";
import { useApiMutation, useGoal, useToday } from "@/lib/hooks";
import { confirmDialog } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/goals" as never);
}

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const today = useToday();
  const { data: goal, isLoading, error, refetch, isRefetching } = useGoal(id);
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [kind, setKind] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState<ISODate>(today);
  const [notes, setNotes] = useState("");

  const contribute = useApiMutation(
    () => api.goals.contribute(id!, { amountCents: kind === "in" ? amount! : -amount!, occurredOn: date, notes: notes.trim() || null }),
    { success: kind === "in" ? "Aporte registrado" : "Resgate registrado", onSuccess: () => { setSheet(false); setAmount(null); setNotes(""); } },
  );
  const removeContribution = useApiMutation((cid: string) => api.goals.removeContribution(id!, cid), { success: "Lançamento removido" });
  const archive = useApiMutation((archived: boolean) => api.goals.update(id!, { status: archived ? "ARCHIVED" : "ACTIVE" }), { success: "Meta atualizada" });
  const remove = useApiMutation(() => api.goals.remove(id!), { success: "Meta excluída", onSuccess: goBack });

  if (!goal) return <Screen header={<ScreenHeader title="Meta" />}>{isLoading ? <SkeletonCard lines={4} /> : <ErrorState error={error} onRetry={() => void refetch()} />}</Screen>;
  if (editing) return <GoalForm initial={goal} />;

  return (
    <Screen
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      header={<ScreenHeader title={goal.name} right={<IconButton icon="pencil" label="Editar" onPress={() => setEditing(true)} />} />}
      footer={goal.status !== "ARCHIVED" ? <Button label="Guardar dinheiro" icon="plus" size="lg" onPress={() => { setKind("in"); setSheet(true); }} /> : undefined}
    >
      <GoalCard goal={goal} />
      <Section title="Histórico de aportes e resgates">
        <Card style={{ paddingVertical: 4 }}>
          {goal.contributions.length === 0 ? (
            <EmptyState icon="piggy-bank" title="Nenhum aporte ainda" message="Registre quanto você já guardou para acompanhar a evolução." />
          ) : (
            goal.contributions.map((c, i) => (
              <View key={c.id}>
                {i > 0 ? <Divider inset={52} /> : null}
                <ListRow
                  title={c.amountCents >= 0 ? "Aporte" : "Resgate"}
                  subtitle={`${formatDateShort(c.occurredOn)}${c.notes ? ` · ${c.notes}` : ""}`}
                  left={<IconBadge icon={c.amountCents >= 0 ? "arrow-down-left" : "arrow-up-right"} color={c.amountCents >= 0 ? colors.positive : colors.negative} size={36} />}
                  right={<Money cents={c.amountCents} signed colorize variant="bodySm" />}
                  onPress={async () => {
                    if (await confirmDialog({ title: "Remover este lançamento?", confirmLabel: "Remover", destructive: true })) removeContribution.mutate(c.id);
                  }}
                />
              </View>
            ))
          )}
        </Card>
      </Section>
      <View style={{ gap: 8 }}>
        {goal.status !== "ARCHIVED" ? <Button label="Resgatar valor" variant="secondary" onPress={() => { setKind("out"); setSheet(true); }} /> : null}
        <Button label={goal.status === "ARCHIVED" ? "Reativar meta" : "Arquivar meta"} variant="secondary" loading={archive.isPending} onPress={() => archive.mutate(goal.status !== "ARCHIVED")} />
        <Button label="Excluir meta" variant="danger" loading={remove.isPending} onPress={async () => { if (await confirmDialog({ title: "Excluir meta?", message: "O histórico de aportes também será removido.", confirmLabel: "Excluir", destructive: true })) remove.mutate(undefined); }} />
      </View>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title={kind === "in" ? "Guardar dinheiro" : "Resgatar dinheiro"}>
        <View style={{ gap: 16 }}>
          <Segmented options={[{ value: "in", label: "Aporte", tone: "positive" }, { value: "out", label: "Resgate", tone: "negative" }]} value={kind} onChange={setKind} />
          <MoneyField label="Valor" value={amount} onChange={setAmount} large autoFocus tone={kind === "in" ? "positive" : "negative"} />
          <DateField label="Data" value={date} onChange={setDate} today={today} />
          <TextField label="Observação (opcional)" value={notes} onChangeText={setNotes} placeholder="Ex.: 13º salário" />
          <Button label="Confirmar" loading={contribute.isPending} disabled={!amount} onPress={() => contribute.mutate(undefined)} />
        </View>
      </Sheet>
    </Screen>
  );
}

import { addMonths, startOfMonth, type ISODate } from "@app/shared";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/Icon";
import { BudgetRow } from "@/components/feature/Rows";
import { Button } from "@/components/ui/Button";
import { Chip, ProgressBar } from "@/components/ui/Controls";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { MoneyField } from "@/components/ui/Inputs";
import { Card, Divider, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { api, type Budget } from "@/lib/api/endpoints";
import { capitalize, formatMonth, formatPct } from "@/lib/format";
import { useApiMutation, useBudgets, useCategories, useToday } from "@/lib/hooks";
import { confirmDialog } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";

const ALERTS = [50, 70, 80, 90] as const;

export default function BudgetsScreen() {
  const { colors } = useTheme();
  const today = useToday();
  const [month, setMonth] = useState<ISODate>(startOfMonth(today));
  const { data, isLoading, isError, error, refetch, isRefetching } = useBudgets(month);
  const categories = useCategories("EXPENSE");
  const [editing, setEditing] = useState<Budget | "new" | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [alertPct, setAlertPct] = useState(80);

  const save = useApiMutation(
    () => api.budgets.upsert({ categoryId: categoryId!, month, amountCents: amount!, alertPct }),
    { success: "Orçamento salvo", onSuccess: () => setEditing(null) },
  );
  const remove = useApiMutation((id: string) => api.budgets.remove(id), { success: "Orçamento removido", onSuccess: () => setEditing(null) });
  const copy = useApiMutation(() => api.budgets.copy(addMonths(month, -1), month), {
    onSuccess: (r) => void r,
    success: "Orçamentos copiados do mês anterior",
  });

  const open = (b: Budget | "new") => {
    setEditing(b);
    if (b === "new") {
      setCategoryId(null);
      setAmount(null);
      setAlertPct(80);
    } else {
      setCategoryId(b.category.id);
      setAmount(b.amountCents);
      setAlertPct(b.alertPct);
    }
  };

  const used = data && data.totalBudgetCents > 0 ? (data.totalSpentCents / data.totalBudgetCents) * 100 : 0;
  const budgetedIds = new Set((data?.budgets ?? []).map((b) => b.category.id));
  const available = (categories.data?.data ?? []).filter((c) => editing !== "new" || !budgetedIds.has(c.id));

  return (
    <Screen
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      header={<ScreenHeader title="Orçamentos" right={<Button label="Novo" icon="plus" size="sm" fullWidth={false} onPress={() => open("new")} />} />}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" hitSlop={10} onPress={() => setMonth(addMonths(month, -1))} style={{ padding: 6 }}>
          <Icon name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <Text variant="heading">{capitalize(formatMonth(month))}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Próximo mês" hitSlop={10} onPress={() => setMonth(addMonths(month, 1))} style={{ padding: 6 }}>
          <Icon name="chevron-right" size={24} color={colors.text} />
        </Pressable>
      </View>

      {isLoading && !data ? (
        <SkeletonCard lines={4} />
      ) : isError && !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data ? (
        <>
          {data.budgets.length > 0 ? (
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                <View>
                  <Text variant="caption" tone="muted">
                    Gasto no mês
                  </Text>
                  <Money cents={data.totalSpentCents} variant="title" weight="700" hideZeroCents />
                </View>
                <Text tone="muted" variant="bodySm">
                  de <Money cents={data.totalBudgetCents} variant="bodySm" weight="600" hideZeroCents tone="muted" /> · {formatPct(used)}
                </Text>
              </View>
              <ProgressBar value={used} color={used >= 100 ? colors.negative : used >= 80 ? colors.warning : colors.positive} height={10} />
            </Card>
          ) : null}

          {data.budgets.length === 0 ? (
            <Card>
              <EmptyState icon="target" title="Nenhum orçamento neste mês" message="Defina um limite por categoria e acompanhe quanto já gastou. Avisamos quando estiver perto de estourar." action="Criar orçamento" onAction={() => open("new")} />
            </Card>
          ) : (
            <Section title="Por categoria">
              <Card style={{ paddingVertical: 4 }}>
                {data.budgets.map((b, i) => (
                  <View key={b.id}>
                    {i > 0 ? <Divider inset={48} /> : null}
                    <BudgetRow budget={b} onPress={() => open(b)} />
                  </View>
                ))}
              </Card>
            </Section>
          )}
          <Button label="Copiar do mês anterior" icon="copy" variant="secondary" loading={copy.isPending} onPress={() => copy.mutate(undefined)} />
        </>
      ) : null}

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Novo orçamento" : "Editar orçamento"}>
        <View style={{ gap: 18 }}>
          {editing === "new" ? (
            <View style={{ gap: 8 }}>
              <Text variant="caption" tone="muted" weight="600">
                Categoria
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {available.map((c) => (
                  <Chip key={c.id} label={c.name} icon={c.icon} color={c.color} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
                ))}
              </View>
            </View>
          ) : (
            <Text weight="700">{(editing as Budget | null)?.category.name}</Text>
          )}
          <MoneyField label="Limite do mês" value={amount} onChange={setAmount} />
          <View style={{ gap: 8 }}>
            <Text variant="caption" tone="muted" weight="600">
              Avisar quando chegar a
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {ALERTS.map((p) => (
                <Chip key={p} label={`${p}%`} selected={alertPct === p} onPress={() => setAlertPct(p)} />
              ))}
            </View>
          </View>
          <Button label="Salvar" loading={save.isPending} disabled={!categoryId || !amount} onPress={() => save.mutate(undefined)} />
          {editing && editing !== "new" ? (
            <Button
              label="Remover orçamento"
              variant="danger"
              loading={remove.isPending}
              onPress={async () => {
                if (await confirmDialog({ title: "Remover orçamento?", confirmLabel: "Remover", destructive: true })) remove.mutate(editing.id);
              }}
            />
          ) : null}
        </View>
      </Sheet>
    </Screen>
  );
}

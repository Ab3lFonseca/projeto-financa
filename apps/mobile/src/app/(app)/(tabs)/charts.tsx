import type { ISODate } from "@app/shared";
import { useState } from "react";
import { View } from "react-native";
import { BarChart, DonutChart, Legend, LineChart } from "@/components/charts/Charts";
import { UpsellCard } from "@/components/feature/Common";
import { Button } from "@/components/ui/Button";
import { Chip, ChipRow, Segmented } from "@/components/ui/Controls";
import { DateField } from "@/components/ui/DateField";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Card, Divider, IconBadge, ListRow, Reveal, Row, Screen, Section } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { ApiError } from "@/lib/api/client";
import type { ReportParams, ReportRange } from "@/lib/api/endpoints";
import { useMe } from "@/lib/auth/AuthProvider";
import { formatDateShort, formatMonth, formatPct } from "@/lib/format";
import { useBalanceEvolution, useCashFlow, useCategoryBreakdown, useIncomeVsExpense, useMonthComparison, useToday } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeProvider";
import type { UseQueryResult } from "@tanstack/react-query";

const RANGES: { value: ReportRange; label: string }[] = [
  { value: "this_month", label: "Este mês" },
  { value: "last_3_months", label: "3 meses" },
  { value: "last_6_months", label: "6 meses" },
  { value: "this_year", label: "Este ano" },
  { value: "custom", label: "Personalizado" },
];
const FREE_RANGES: ReportRange[] = ["this_month", "last_3_months"];

/** Cartão de gráfico: mostra o gráfico, um esqueleto ao carregar ou o convite ao Premium (402). */
function ChartCard<T>({ query, children, empty }: { query: UseQueryResult<T, unknown>; children: (data: T) => React.ReactNode; empty?: (data: T) => boolean }) {
  if (query.error instanceof ApiError && query.error.code === "PLAN_LIMIT_REACHED") return <UpsellCard text={query.error.message} />;
  if (query.isLoading && !query.data) {
    return (
      <Card style={{ gap: 12 }}>
        <Skeleton height={16} width="40%" />
        <Skeleton height={160} radius={12} />
      </Card>
    );
  }
  if (query.isError && !query.data) {
    return (
      <Card>
        <EmptyState icon="cloud-off" title="Não foi possível carregar" action="Tentar de novo" onAction={() => void query.refetch()} />
      </Card>
    );
  }
  if (!query.data) return null;
  if (empty?.(query.data)) {
    return (
      <Card>
        <EmptyState icon="chart-pie" title="Sem dados no período" message="Registre lançamentos ou escolha outro período." />
      </Card>
    );
  }
  return <Card style={{ gap: 16 }}>{children(query.data)}</Card>;
}

export default function ChartsScreen() {
  const { colors } = useTheme();
  const today = useToday();
  const me = useMe();
  const advanced = me.entitlements.features.advancedReports;
  const [range, setRange] = useState<ReportRange>("this_month");
  const [custom, setCustom] = useState<{ from: ISODate; to: ISODate }>({ from: today, to: today });
  const [customOpen, setCustomOpen] = useState(false);
  const [upsell, setUpsell] = useState(false);
  const [catType, setCatType] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [bucket, setBucket] = useState<"week" | "month" | undefined>(undefined);

  const params: ReportParams = range === "custom" ? { range, from: custom.from, to: custom.to } : { range };
  const categories = useCategoryBreakdown(params, catType);
  const incomeExpense = useIncomeVsExpense(params, bucket);
  const balance = useBalanceEvolution(params);
  const cashFlow = useCashFlow(params, bucket);
  const comparison = useMonthComparison();

  const choose = (r: ReportRange) => {
    if (!advanced && !FREE_RANGES.includes(r)) return setUpsell(true);
    setRange(r);
    if (r === "custom") setCustomOpen(true);
  };
  const refreshing = categories.isRefetching || incomeExpense.isRefetching || balance.isRefetching;
  const refresh = () => void Promise.all([categories.refetch(), incomeExpense.refetch(), balance.refetch(), cashFlow.refetch(), comparison.refetch()]);

  const header = (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
      <Text variant="title">Gráficos</Text>
      <ChipRow>
        {RANGES.map((r) => (
          <Chip key={r.value} label={r.label} icon={!advanced && !FREE_RANGES.includes(r.value) ? "lock" : undefined} selected={range === r.value} onPress={() => choose(r.value)} />
        ))}
      </ChipRow>
    </View>
  );

  const periodLabel = incomeExpense.data ? `${formatDateShort(incomeExpense.data.range.from)} – ${formatDateShort(incomeExpense.data.range.to)}` : "";

  return (
    <Screen tabs header={header} refreshing={refreshing} onRefresh={refresh}>
      {periodLabel ? (
        <Text variant="caption" tone="muted">
          Período: {periodLabel}
        </Text>
      ) : null}

      {/* Despesas por categoria */}
      <Reveal index={0}>
        <Section title={catType === "EXPENSE" ? "Despesas por categoria" : "Receitas por categoria"}>
          <ChartCard query={categories} empty={(d) => d.items.length === 0}>
            {(d) => (
              <>
                <Segmented options={[{ value: "EXPENSE", label: "Despesas", tone: "negative" }, { value: "INCOME", label: "Receitas", tone: "positive" }]} value={catType} onChange={setCatType} />
                <View style={{ alignItems: "center" }}>
                  <DonutChart data={d.items.map((i) => ({ value: i.totalCents, color: i.color }))} size={180} thickness={24}>
                    <Text variant="caption" tone="muted">
                      Total
                    </Text>
                    <Money cents={d.totalCents} variant="heading" weight="700" hideZeroCents />
                  </DonutChart>
                </View>
                <View>
                  {d.items.map((i, idx) => (
                    <View key={`${i.categoryId}-${idx}`}>
                      {idx > 0 ? <Divider /> : null}
                      <ListRow
                        title={i.name}
                        subtitle={`${i.count} lançamento${i.count > 1 ? "s" : ""}`}
                        left={<IconBadge icon={i.icon} color={i.color} size={34} />}
                        right={
                          <View style={{ alignItems: "flex-end" }}>
                            <Money cents={i.totalCents} variant="bodySm" />
                            <Text variant="caption" tone="faint">
                              {formatPct(i.pct)}
                            </Text>
                          </View>
                        }
                        style={{ paddingVertical: 8 }}
                      />
                    </View>
                  ))}
                </View>
              </>
            )}
          </ChartCard>
        </Section>
      </Reveal>

      {/* Receitas x despesas */}
      <Reveal index={1}>
        <Section title="Receitas × despesas">
          <ChartCard query={incomeExpense} empty={(d) => d.points.every((p) => p.incomeCents === 0 && p.expenseCents === 0)}>
            {(d) => (
              <>
                <Segmented<"auto" | "week" | "month"> options={[{ value: "auto", label: "Automático" }, { value: "week", label: "Semanas" }, { value: "month", label: "Meses" }]} value={bucket ?? "auto"} onChange={(v) => setBucket(v === "auto" ? undefined : v)} />
                <BarChart data={d.points.map((p) => ({ key: p.key, label: p.label, values: [p.incomeCents, p.expenseCents] }))} colors={[colors.positive, colors.negative]} seriesLabels={["Receitas", "Despesas"]} />
                <Legend items={[{ color: colors.positive, label: "Receitas" }, { color: colors.negative, label: "Despesas" }]} />
              </>
            )}
          </ChartCard>
        </Section>
      </Reveal>

      {/* Gastos por semana / mês */}
      <Reveal index={2}>
        <Section title={incomeExpense.data?.granularity === "week" ? "Gastos por semana" : "Gastos por mês"}>
          <ChartCard query={incomeExpense} empty={(d) => d.points.every((p) => p.expenseCents === 0)}>
            {(d) => <BarChart data={d.points.map((p) => ({ key: p.key, label: p.label, values: [p.expenseCents] }))} colors={[colors.primary]} seriesLabels={["Gastos"]} height={180} />}
          </ChartCard>
        </Section>
      </Reveal>

      {/* Evolução do saldo */}
      <Reveal index={3}>
        <Section title="Evolução do saldo">
          <ChartCard query={balance} empty={(d) => d.points.length === 0}>
            {(d) => (
              <>
                <Row style={{ justifyContent: "space-between" }} align="flex-start">
                  <View>
                    <Text variant="caption" tone="muted">
                      Início do período
                    </Text>
                    <Money cents={d.startingBalanceCents} weight="700" />
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text variant="caption" tone="muted">
                      Agora
                    </Text>
                    <Money cents={d.endingBalanceCents} weight="700" />
                  </View>
                </Row>
                <LineChart points={d.points.map((p) => ({ label: formatDateShort(p.date), value: p.balanceCents }))} />
              </>
            )}
          </ChartCard>
        </Section>
      </Reveal>

      {/* Fluxo de caixa */}
      <Reveal index={4}>
        <Section title="Fluxo de caixa">
          <ChartCard query={cashFlow} empty={(d) => d.points.every((p) => p.inflowCents === 0 && p.outflowCents === 0)}>
            {(d) => (
              <>
                <Text variant="caption" tone="muted">
                  Entradas e saídas das suas contas. Compras no cartão só saem quando a fatura é paga.
                </Text>
                <BarChart data={d.points.map((p) => ({ key: p.key, label: p.label, values: [p.inflowCents, -p.outflowCents] }))} colors={[colors.positive, colors.negative]} seriesLabels={["Entradas", "Saídas"]} />
                <Legend items={[{ color: colors.positive, label: "Entradas" }, { color: colors.negative, label: "Saídas" }]} />
                <Text variant="caption" tone="muted" weight="600">
                  Acumulado no período
                </Text>
                <LineChart points={d.points.map((p) => ({ label: p.label, value: p.cumulativeCents }))} height={150} color={colors.primary} />
              </>
            )}
          </ChartCard>
        </Section>
      </Reveal>

      {/* Comparação entre meses */}
      <Reveal index={5}>
        <Section title="Comparação entre meses">
          <ChartCard query={comparison}>
            {(d) => (
              <>
                <Text variant="caption" tone="muted">
                  {formatMonth(d.current.month)} × {formatMonth(d.previous.month)} (até o mesmo dia)
                </Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <CompareCol title="Despesas" now={d.current.expenseCents} before={d.previous.expenseCents} change={d.expenseChangePct} goodWhenDown />
                  <CompareCol title="Receitas" now={d.current.incomeCents} before={d.previous.incomeCents} change={d.incomeChangePct} />
                </View>
                <Divider />
                <Text variant="caption" tone="muted" weight="600">
                  O que mais mudou nas despesas
                </Text>
                {d.categories.slice(0, 5).map((c) => (
                  <Row key={`${c.categoryId}-${c.name}`} style={{ justifyContent: "space-between" }}>
                    <Row gap={8} style={{ flex: 1 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color }} />
                      <Text variant="bodySm" numberOfLines={1} style={{ flex: 1 }}>
                        {c.name}
                      </Text>
                    </Row>
                    <Money cents={c.deltaCents} signed variant="bodySm" tone={c.deltaCents > 0 ? "negative" : c.deltaCents < 0 ? "positive" : "muted"} />
                  </Row>
                ))}
              </>
            )}
          </ChartCard>
        </Section>
      </Reveal>

      <Sheet visible={customOpen} onClose={() => setCustomOpen(false)} title="Período personalizado">
        <View style={{ gap: 14 }}>
          <DateField label="De" value={custom.from} today={today} onChange={(d) => setCustom((c) => ({ from: d, to: d > c.to ? d : c.to }))} />
          <DateField label="Até" value={custom.to} today={today} onChange={(d) => setCustom((c) => ({ from: d < c.from ? d : c.from, to: d }))} />
          <Button label="Aplicar" onPress={() => setCustomOpen(false)} />
        </View>
      </Sheet>
      <Sheet visible={upsell} onClose={() => setUpsell(false)} title="Recurso Premium">
        <View style={{ gap: 14 }}>
          <Text tone="muted">Períodos mais longos e personalizados nos gráficos fazem parte do plano Premium.</Text>
          <Button label="Entendi" onPress={() => setUpsell(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

function CompareCol({ title, now, before, change, goodWhenDown }: { title: string; now: number; before: number; change: number | null; goodWhenDown?: boolean }) {
  const good = change === null ? null : goodWhenDown ? change <= 0 : change >= 0;
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text variant="caption" tone="muted" weight="600">
        {title}
      </Text>
      <Money cents={now} variant="heading" weight="700" hideZeroCents />
      <Text variant="caption" tone="muted">
        antes: <Money cents={before} variant="caption" tone="muted" weight="400" hideZeroCents />
      </Text>
      {change !== null ? (
        <Text variant="caption" weight="700" tone={good ? "positive" : "negative"}>
          {formatPct(change, { signed: true })}
        </Text>
      ) : null}
    </View>
  );
}


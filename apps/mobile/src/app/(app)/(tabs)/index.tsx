import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { NextBadges } from "@/components/badges/NextBadges";
import { BarChart, DonutChart, Legend, LineChart } from "@/components/charts/Charts";
import { AccessBanner } from "@/components/feature/AccessBanner";
import { Fab, InsightCard, PendingSyncBanner } from "@/components/feature/Common";
import { TourTarget } from "@/components/tour/TourTarget";
import { AccountTile, BudgetRow, CreditCardView, GoalCard, SummaryTile, TransactionRow } from "@/components/feature/Rows";
import { IconButton } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Controls";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Divider, ListRow, Reveal, Row, Screen, Section, IconBadge } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { Text } from "@/components/ui/Text";
import { useMe } from "@/lib/auth/AuthProvider";
import { capitalize, formatDateLong, formatDateShort, formatMonth, formatPct } from "@/lib/format";
import { useDashboard, useUnreadCount } from "@/lib/hooks";
import { usePrivacyStore } from "@/lib/privacy-store";
import { monthShortPt } from "@app/shared";
import { withAlpha } from "@/theme/color";
import { useTheme } from "@/theme/ThemeProvider";

const go = (path: string) => router.push(path as never);

export default function HomeScreen() {
  const me = useMe();
  const { colors, radius } = useTheme();
  const { data, isLoading, isError, error, refetch, isRefetching } = useDashboard();
  const unread = useUnreadCount().data?.count ?? data?.unreadNotifications ?? 0;
  const hide = usePrivacyStore((s) => s.hideAmounts);
  const toggleHide = usePrivacyStore((s) => s.toggle);
  const [evoMode, setEvoMode] = useState<"flow" | "balance">("flow");
  const firstName = me.profile.displayName?.split(" ")[0];

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Text variant="title">{firstName ? `Olá, ${firstName}` : "Olá!"}</Text>
        <Text variant="caption" tone="muted">
          {data ? capitalize(formatDateLong(data.today)) : " "}
        </Text>
      </View>
      <IconButton icon={hide ? "eye-off" : "eye"} label={hide ? "Mostrar valores" : "Ocultar valores"} onPress={toggleHide} />
      <IconButton icon="bell" label="Notificações" onPress={() => go("/notifications")} badge={unread} />
    </View>
  );

  if (isLoading && !data) {
    return (
      <Screen header={header} tabs>
        <SkeletonCard />
        <SkeletonCard lines={4} />
        <SkeletonCard />
      </Screen>
    );
  }
  if (isError && !data) {
    return (
      <Screen header={header} tabs>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }
  if (!data) return null;

  const noAccounts = data.accounts.length === 0;
  const m = data.month;
  const monthName = formatMonth(m.month);

  return (
    <View style={{ flex: 1 }}>
      <Screen header={header} tabs refreshing={isRefetching} onRefresh={() => void refetch()} contentStyle={{ paddingBottom: 96 }}>
        <AccessBanner />
        <PendingSyncBanner />

        {/* Saldo total */}
        <Reveal index={0}>
          <TourTarget id="home-balance">
          <View style={{ borderRadius: radius.xl, backgroundColor: colors.primary, padding: 22, gap: 14, overflow: "hidden" }}>
            <View style={{ position: "absolute", right: -40, top: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: withAlpha(colors.onPrimary, 0.1) }} />
            <View style={{ position: "absolute", right: 30, bottom: -60, width: 140, height: 140, borderRadius: 70, backgroundColor: withAlpha(colors.onPrimary, 0.07) }} />
            <Text variant="bodySm" style={{ color: withAlpha(colors.onPrimary, 0.8) }} weight="500">
              Saldo total
            </Text>
            <Money cents={data.totalBalanceCents} variant="display" weight="700" style={{ color: colors.onPrimary }} animate />
            <Text variant="caption" style={{ color: withAlpha(colors.onPrimary, 0.8) }}>
              {capitalize(monthName)}
              {m.savingsRatePct !== null ? ` · você guardou ${formatPct(m.savingsRatePct)} do que recebeu` : ""}
            </Text>
          </View>
          </TourTarget>
        </Reveal>

        {noAccounts ? (
          <Card>
            <EmptyState icon="landmark" title="Comece criando uma conta" message="Cadastre sua conta bancária ou carteira para começar a registrar receitas e despesas." action="Criar conta" onAction={() => go("/account/new")} />
          </Card>
        ) : null}

        {/* Receitas / Despesas / Economia */}
        <Reveal index={1}>
          <Row gap={10} align="flex-start">
            <SummaryTile label="Receitas" cents={m.incomeCents} change={m.incomeChangePct} tone="positive" />
            <SummaryTile label="Despesas" cents={m.expenseCents} change={m.expenseChangePct} tone="negative" goodWhenDown />
            <SummaryTile label="Economia" cents={m.savingsCents} tone="primary" />
          </Row>
        </Reveal>

        {/* Insights */}
        {data.insights.length > 0 ? (
          <Reveal index={2}>
            <Section title="Para você">
              <View style={{ gap: 10 }}>
                {data.insights.slice(0, 4).map((i) => (
                  <InsightCard key={i.id} insight={i} />
                ))}
              </View>
            </Section>
          </Reveal>
        ) : null}

        {/* Gastos por categoria */}
        {data.spendingByCategory.length > 0 ? (
          <Reveal index={3}>
            <Section title="Gastos por categoria" action="Ver gráficos" onAction={() => go("/charts")}>
              <Card style={{ gap: 18 }}>
                <View style={{ alignItems: "center" }}>
                  <DonutChart data={data.spendingByCategory.map((c) => ({ value: c.totalCents, color: c.color }))}>
                    <Text variant="caption" tone="muted">
                      Gasto no mês
                    </Text>
                    <Money cents={m.expenseCents} variant="heading" weight="700" hideZeroCents />
                  </DonutChart>
                </View>
                <View>
                  {data.spendingByCategory.map((c, i) => (
                    <View key={`${c.categoryId}-${i}`}>
                      {i > 0 ? <Divider /> : null}
                      <ListRow
                        title={c.name}
                        left={<IconBadge icon={c.icon} color={c.color} size={34} />}
                        right={
                          <View style={{ alignItems: "flex-end" }}>
                            <Money cents={c.totalCents} variant="bodySm" />
                            <Text variant="caption" tone="faint">
                              {formatPct(c.pct)}
                            </Text>
                          </View>
                        }
                        style={{ paddingVertical: 8 }}
                      />
                    </View>
                  ))}
                </View>
              </Card>
            </Section>
          </Reveal>
        ) : null}

        {/* Evolução financeira */}
        <Reveal index={4}>
          <Section title="Evolução financeira">
            <Card style={{ gap: 14 }}>
              <Segmented
                options={[
                  { value: "flow", label: "Receitas × despesas" },
                  { value: "balance", label: "Saldo" },
                ]}
                value={evoMode}
                onChange={setEvoMode}
              />
              {evoMode === "flow" ? (
                <>
                  <BarChart
                    data={data.evolution.map((e) => ({ key: e.month, label: monthShortPt(e.month), values: [e.incomeCents, e.expenseCents] }))}
                    colors={[colors.positive, colors.negative]}
                    seriesLabels={["Receitas", "Despesas"]}
                    height={190}
                  />
                  <Legend
                    items={[
                      { color: colors.positive, label: "Receitas" },
                      { color: colors.negative, label: "Despesas" },
                    ]}
                  />
                </>
              ) : (
                <LineChart points={data.evolution.map((e) => ({ label: monthShortPt(e.month), value: e.balanceCents }))} height={190} />
              )}
            </Card>
          </Section>
        </Reveal>

        {/* Contas */}
        {!noAccounts ? (
          <Reveal index={5}>
            <Section title="Contas" action="Ver todas" onAction={() => go("/wallet")}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, flexGrow: 0 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
                {data.accounts.map((a) => (
                  <AccountTile key={a.id} account={a} width={210} onPress={() => go(`/account/${a.id}`)} />
                ))}
              </ScrollView>
            </Section>
          </Reveal>
        ) : null}

        {/* Cartões */}
        {data.cards.length > 0 ? (
          <Reveal index={6}>
            <Section title="Cartões" action="Ver todos" onAction={() => go("/wallet?tab=cards")}>
              <View style={{ gap: 12 }}>
                {data.cards.slice(0, 2).map((c) => (
                  <CreditCardView key={c.id} card={c} onPress={() => go(`/card/${c.id}`)} />
                ))}
              </View>
            </Section>
          </Reveal>
        ) : null}

        {/* Orçamentos em alerta */}
        {data.budgetAlerts.length > 0 ? (
          <Reveal index={7}>
            <Section title="Orçamentos em alerta" action="Ver orçamentos" onAction={() => go("/budgets")}>
              <Card style={{ paddingVertical: 6 }}>
                {data.budgetAlerts.map((b, i) => (
                  <View key={b.id}>
                    {i > 0 ? <Divider /> : null}
                    <BudgetRow budget={b} onPress={() => go("/budgets")} />
                  </View>
                ))}
              </Card>
            </Section>
          </Reveal>
        ) : null}

        {/* Metas */}
        {data.goals.length > 0 ? (
          <Reveal index={8}>
            <Section title="Metas" action="Ver metas" onAction={() => go("/goals")}>
              <View style={{ gap: 12 }}>
                {data.goals.map((g) => (
                  <GoalCard key={g.id} goal={g} onPress={() => go(`/goals/${g.id}`)} />
                ))}
              </View>
            </Section>
          </Reveal>
        ) : null}

        {/* Próximas contas */}
        {data.upcoming.bills.length + data.upcoming.invoices.length > 0 ? (
          <Section title="Próximos vencimentos">
            <Card style={{ paddingVertical: 6 }}>
              {data.upcoming.invoices.map((i, idx) => (
                <View key={i.invoiceId}>
                  {idx > 0 ? <Divider /> : null}
                  <ListRow
                    title={`Fatura ${i.cardName}`}
                    subtitle={`Vence ${formatDateShort(i.dueDate)}`}
                    left={<IconBadge icon="credit-card" color={colors.primary} size={36} />}
                    right={<Money cents={-i.remainingCents} variant="bodySm" colorize />}
                    onPress={() => go(`/card/${i.cardId}/invoice/${i.invoiceId}`)}
                  />
                </View>
              ))}
              {data.upcoming.bills.map((b, idx) => (
                <View key={`${b.ruleId}-${b.date}`}>
                  {idx > 0 || data.upcoming.invoices.length > 0 ? <Divider /> : null}
                  <ListRow
                    title={b.description}
                    subtitle={`Em ${formatDateShort(b.date)}`}
                    left={<IconBadge icon={b.category?.icon ?? "repeat"} color={b.category?.color ?? colors.primary} size={36} />}
                    right={<Money cents={b.type === "EXPENSE" ? -b.amountCents : b.amountCents} variant="bodySm" colorize />}
                  />
                </View>
              ))}
            </Card>
          </Section>
        ) : null}

        {/* Insígnias a caminho do próximo nível */}
        <NextBadges />

        {/* Últimas transações */}
        <Reveal index={9}>
          <Section title="Últimas transações" action="Ver todas" onAction={() => go("/transactions")}>
            <Card style={{ paddingVertical: 6 }}>
              {data.recentTransactions.length === 0 ? (
                <EmptyState icon="receipt" title="Nenhuma transação ainda" message="Toque no + para registrar sua primeira receita ou despesa." />
              ) : (
                data.recentTransactions.map((t, i) => (
                  <View key={t.id}>
                    {i > 0 ? <Divider inset={52} /> : null}
                    <TransactionRow tx={t} showDate onPress={() => go(`/transaction/${t.id}`)} />
                  </View>
                ))
              )}
            </Card>
          </Section>
        </Reveal>
      </Screen>
      <Fab tourId="home-fab" />
    </View>
  );
}


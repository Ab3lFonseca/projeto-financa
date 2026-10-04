import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { LineChart } from "@/components/charts/Charts";
import { investmentIcon } from "@/components/feature/InvestmentCard";
import { Badge } from "@/components/ui/Controls";
import { ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Divider, IconBadge, Row, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { Text } from "@/components/ui/Text";
import { formatAgo, formatDateShort, formatPct } from "@/lib/format";
import { useInvestment } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeProvider";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Row style={{ justifyContent: "space-between", paddingVertical: 12 }}>
      <Text tone="muted">{label}</Text>
      <View style={{ alignItems: "flex-end", flexShrink: 1 }}>{children}</View>
    </Row>
  );
}

/** Detalhe de um investimento: valor, rendimento, evolução diária e dados do contrato como o banco informou. */
export default function InvestmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { data: inv, isLoading, error, refetch, isRefetching } = useInvestment(id);

  if (!inv) {
    return <Screen header={<ScreenHeader title="Investimento" />}>{isLoading ? <SkeletonCard lines={5} /> : <ErrorState error={error} onRetry={() => void refetch()} />}</Screen>;
  }
  const profit = inv.profitCents;
  const history = inv.history;

  return (
    <Screen refreshing={isRefetching} onRefresh={() => void refetch()} header={<ScreenHeader title={inv.name} subtitle={`${inv.institutionName} · ${inv.groupLabel}`} />}>
      <Card style={{ gap: 14 }}>
        <Row>
          <IconBadge icon={investmentIcon(inv)} color={colors.primary} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="caption" tone="muted">
              Valor atual
            </Text>
            <Money cents={inv.balanceCents} variant="title" weight="700" />
          </View>
          {inv.closed ? <Badge label="Encerrado" /> : null}
        </Row>
        {profit !== null ? (
          <Row gap={8}>
            <Money cents={profit} signed colorize variant="body" weight="700" />
            {inv.profitPct !== null ? (
              <Text tone={profit >= 0 ? "positive" : "negative"} weight="600">
                ({formatPct(inv.profitPct, { signed: true })})
              </Text>
            ) : null}
            <Text tone="muted">de rendimento desde a aplicação</Text>
          </Row>
        ) : null}
      </Card>

      <Section title="Evolução">
        <Card style={{ gap: 10 }}>
          {history.length >= 2 ? (
            <LineChart points={history.map((h) => ({ label: formatDateShort(h.date), value: h.balanceCents }))} height={190} fitRange color={profit !== null && profit < 0 ? colors.negative : colors.positive} />
          ) : (
            <Text tone="muted" variant="bodySm">
              O histórico começa hoje: a cada dia o app guarda o valor deste investimento e o gráfico aparece a partir do segundo dia.
            </Text>
          )}
        </Card>
      </Section>

      <Section title="Detalhes">
        <Card style={{ paddingVertical: 2 }}>
          {inv.investedCents !== null ? (
            <>
              <Field label="Valor aplicado">
                <Money cents={inv.investedCents} weight="600" />
              </Field>
              <Divider />
            </>
          ) : null}
          {inv.withdrawableCents !== null ? (
            <>
              <Field label="Disponível para resgate">
                <Money cents={inv.withdrawableCents} weight="600" />
              </Field>
              <Divider />
            </>
          ) : null}
          {inv.rateLabel ? (
            <>
              <Field label="Taxa">
                <Text weight="600">{inv.rateLabel}</Text>
              </Field>
              <Divider />
            </>
          ) : null}
          {inv.issuer ? (
            <>
              <Field label="Emissor">
                <Text weight="600" align="right">
                  {inv.issuer}
                </Text>
              </Field>
              <Divider />
            </>
          ) : null}
          {inv.issueDate ? (
            <>
              <Field label="Aplicação em">
                <Text weight="600">{formatDateShort(inv.issueDate)}</Text>
              </Field>
              <Divider />
            </>
          ) : null}
          {inv.dueDate ? (
            <>
              <Field label="Vencimento">
                <Text weight="600">{formatDateShort(inv.dueDate)}</Text>
              </Field>
              <Divider />
            </>
          ) : null}
          <Field label="Última leitura do banco">
            <Text weight="600">{formatAgo(inv.updatedAt)}</Text>
          </Field>
        </Card>
      </Section>

      <Text variant="caption" tone="faint" align="center">
        Dados informados pelo seu banco via Open Finance. Somente leitura: o app não faz aplicações nem resgates.
      </Text>
    </Screen>
  );
}

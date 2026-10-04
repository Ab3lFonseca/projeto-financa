import { View } from "react-native";
import { Badge } from "@/components/ui/Controls";
import { Card, IconBadge, Row } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { Text } from "@/components/ui/Text";
import type { Investment } from "@/lib/api/endpoints";
import { formatDateShort, formatPct } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";

/** Ícone pelo tipo; caixinhas, cofrinhos e porquinhos ganham o cofre. */
export function investmentIcon(i: Pick<Investment, "name" | "groupKey" | "type">): string {
  if (/porquinho|caixinha|cofrinho|cofre/i.test(i.name)) return "piggy-bank";
  if (["STOCK", "BDR", "ETF", "ETF_FUND", "EQUITY", "DERIVATIVES", "OPTION"].includes(i.groupKey) || i.type === "EQUITY") return "trending-up";
  if (i.type === "MUTUAL_FUND" || i.groupKey.endsWith("_FUND")) return "chart-column";
  return "landmark";
}

/** Cartão de um investimento: valor atual, rendimento acumulado, taxa e vencimento (como o banco informou). */
export function InvestmentCard({ item, onPress }: { item: Investment; onPress?: () => void }) {
  const { colors } = useTheme();
  const profit = item.profitCents;
  return (
    <Card onPress={onPress} style={{ gap: 12 }}>
      <Row>
        <IconBadge icon={investmentIcon(item)} color={colors.primary} size={40} />
        <View style={{ flex: 1 }}>
          <Text weight="600" numberOfLines={1}>
            {item.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {item.institutionName} · {item.groupLabel}
          </Text>
        </View>
        <Money cents={item.balanceCents} variant="body" weight="700" />
      </Row>
      <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }} gap={8}>
        {profit !== null ? (
          <Row gap={6}>
            <Money cents={profit} signed colorize variant="bodySm" weight="600" />
            {item.profitPct !== null ? (
              <Text variant="caption" tone={profit >= 0 ? "positive" : "negative"} weight="600">
                ({formatPct(item.profitPct, { signed: true })})
              </Text>
            ) : null}
            <Text variant="caption" tone="faint">
              de rendimento
            </Text>
          </Row>
        ) : (
          <Text variant="caption" tone="faint">
            Rendimento não informado pelo banco
          </Text>
        )}
        <Row gap={6}>
          {item.rateLabel ? <Badge label={item.rateLabel} tone="primary" /> : null}
          {item.dueDate ? <Badge label={`Vence ${formatDateShort(item.dueDate)}`} /> : null}
        </Row>
      </Row>
    </Card>
  );
}

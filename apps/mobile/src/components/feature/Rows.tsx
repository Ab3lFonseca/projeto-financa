import { PAYMENT_METHOD_LABEL_PT } from "@app/shared";
import { View } from "react-native";
import { Icon } from "@/components/Icon";
import { Badge, ProgressBar } from "@/components/ui/Controls";
import { brighten, useHover } from "@/components/ui/hover";
import { AnimatedPressable, PressableRow, useSpringPress } from "@/components/ui/Interactive";
import { Card, IconBadge, Row } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { Text } from "@/components/ui/Text";
import type { Account, BankOverview, Budget, Card as CardModel, Goal, Transaction } from "@/lib/api/endpoints";
import { formatAgo, formatBRL, formatDateShort, formatPct } from "@/lib/format";
import { withAlpha } from "@/theme/color";
import { useTheme } from "@/theme/ThemeProvider";

/** Linha de lançamento: ícone da categoria, descrição, origem e valor (verde/vermelho). */
export function TransactionRow({ tx, onPress, showDate }: { tx: Transaction; onPress?: () => void; showDate?: boolean }) {
  const { colors } = useTheme();
  const isTransfer = tx.type === "TRANSFER";
  const isIncome = tx.type === "INCOME" || (isTransfer && tx.transferSide === "IN");
  const signed = isIncome ? tx.amountCents : -tx.amountCents;
  const source = tx.card?.name ?? tx.account?.name;
  const parts = [
    isTransfer ? (tx.transferSide === "OUT" ? `para ${tx.counterpartAccount?.name ?? "outra conta"}` : `de ${tx.counterpartAccount?.name ?? "outra conta"}`) : (tx.category?.name ?? "Sem categoria"),
    tx.card ? tx.card.name : tx.paymentMethod !== "OTHER" ? PAYMENT_METHOD_LABEL_PT[tx.paymentMethod] : source,
    showDate ? formatDateShort(tx.occurredOn) : null,
  ].filter(Boolean);

  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: onPress ? 9 : 11 }}>
      <IconBadge
        icon={isTransfer ? "arrow-left-right" : (tx.category?.icon ?? "circle-help")}
        color={isTransfer ? colors.primary : (tx.category?.color ?? colors.textFaint)}
      />
      <View style={{ flex: 1, gap: 3 }}>
        <Row gap={6}>
          <Text weight="500" numberOfLines={1} style={{ flexShrink: 1 }}>
            {tx.description}
          </Text>
          {tx.installment ? <Badge label={`${tx.installment.number}/${tx.installment.total}`} /> : null}
          {tx.status === "PENDING" ? <Badge label="Pendente" tone="warning" /> : null}
        </Row>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {parts.join(" · ")}
        </Text>
      </View>
      <Money cents={signed} colorize={!isTransfer} signed={!isTransfer} tone={isTransfer ? "muted" : undefined} />
    </View>
  );
  return onPress ? <PressableRow onPress={onPress}>{() => body}</PressableRow> : body;
}

/** Resumo de conta (lista horizontal na Início e na Carteira). */
/** `bank` = o que o banco informou pelo Open Finance para esta conta (saldo e hora da leitura). */
export function AccountTile({ account, onPress, width, bank }: { account: Account; onPress?: () => void; width?: number; bank?: BankOverview["accounts"][number] }) {
  const { colors } = useTheme();
  const tint = account.color ?? colors.primary;
  return (
    <Card onPress={onPress} style={{ width, gap: 14 }}>
      <Row>
        <IconBadge icon={account.type === "WALLET" ? "wallet" : account.type === "INVESTMENT" ? "trending-up" : account.type === "SAVINGS" ? "piggy-bank" : "landmark"} color={tint} size={36} />
        <View style={{ flex: 1 }}>
          <Text weight="600" numberOfLines={1}>
            {account.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {account.bank?.shortName ?? account.bank?.name ?? ACCOUNT_LABEL[account.type]}
          </Text>
        </View>
      </Row>
      <Money cents={account.balanceCents} variant="heading" weight="700" tone={account.balanceCents < 0 ? "negative" : undefined} animate />
      {bank && bank.balanceCents !== null ? (
        <Row gap={6}>
          <Icon name="link" size={12} color={colors.textFaint} />
          <Text variant="caption" tone="faint" numberOfLines={1} style={{ flexShrink: 1 }}>
            Saldo no banco {formatBRL(bank.balanceCents)} · {formatAgo(bank.updatedAt)}
          </Text>
        </Row>
      ) : null}
    </Card>
  );
}

const ACCOUNT_LABEL: Record<Account["type"], string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  WALLET: "Carteira",
  DIGITAL: "Conta digital",
  INVESTMENT: "Investimentos",
};

/** Cartão de crédito "visual": cor do cartão, final, limite usado e fatura atual. */
/** `bank` = limite, fatura e vencimento como o banco informou pelo Open Finance (atualizam sozinhos). */
export function CreditCardView({ card, onPress, bank }: { card: CardModel; onPress?: () => void; bank?: BankOverview["cards"][number] }) {
  const { colors, radius } = useTheme();
  const { hovered, hoverProps } = useHover();
  const press = useSpringPress(0.985);
  const tint = card.color ?? colors.primary;
  // Texto sobre o cartão: branco nas cores escolhidas pelo usuário (como sempre foi); com a cor principal do tema, o texto próprio dela.
  const fg = card.color ? "#FFFFFF" : colors.onPrimary;
  // Com Open Finance, os números do banco são a verdade (limite, disponível, fatura e vencimento).
  const limit = bank?.limitCents ?? card.limitCents;
  const available = bank?.availableCents ?? card.availableCents;
  const usedPct = limit > 0 ? ((limit - available) / limit) * 100 : 0;
  const inv = card.currentInvoice;
  const invoiceTotal = bank?.billCents ?? inv?.totalCents ?? 0;
  const invoiceDue = bank?.dueDate ?? inv?.dueDate ?? null;
  return (
    <AnimatedPressable accessibilityRole="button" onPress={onPress} {...hoverProps} onPressIn={press.onPressIn} onPressOut={press.onPressOut} style={press.style}>
      <View style={[{ borderRadius: radius.lg, backgroundColor: tint, padding: 18, gap: 18 }, onPress ? brighten(hovered) : null]}>
        <Row style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text weight="700" style={{ color: fg }} numberOfLines={1}>
              {card.name}
            </Text>
            <Text variant="caption" style={{ color: withAlpha(fg, 0.8) }}>
              {card.bank?.shortName ?? card.brand} {card.last4 ? `• • • • ${card.last4}` : ""}
            </Text>
          </View>
          <Icon name="credit-card" size={26} color={withAlpha(fg, 0.9)} />
        </Row>
        <View style={{ gap: 6 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text variant="caption" style={{ color: withAlpha(fg, 0.8) }}>
              Limite disponível
            </Text>
            <Money cents={available} variant="bodySm" weight="700" style={{ color: fg }} />
          </Row>
          <ProgressBar value={usedPct} color={fg} track={withAlpha(fg, 0.3)} height={6} />
          <Row style={{ justifyContent: "space-between" }}>
            <Text variant="caption" style={{ color: withAlpha(fg, 0.8) }}>
              {invoiceDue ? `Fatura atual · vence ${formatDateShort(invoiceDue)}` : "Sem fatura em aberto"}
            </Text>
            <Money cents={invoiceTotal} variant="bodySm" weight="700" style={{ color: fg }} />
          </Row>
        </View>
        {bank ? (
          <Row gap={6}>
            <Icon name="link" size={12} color={withAlpha(fg, 0.85)} />
            <Text variant="caption" style={{ color: withAlpha(fg, 0.85) }}>
              Dados do banco · atualizado {formatAgo(bank.updatedAt)}
            </Text>
          </Row>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

const STATUS_TONE = { OK: "positive", WARNING: "warning", EXCEEDED: "negative" } as const;
const STATUS_LABEL = { OK: "Dentro do limite", WARNING: "Atenção", EXCEEDED: "Estourado" } as const;

/** Orçamento da categoria: gasto × limite com barra colorida pelo status. */
export function BudgetRow({ budget, onPress }: { budget: Budget; onPress?: () => void }) {
  const { colors } = useTheme();
  const color = budget.status === "EXCEEDED" ? colors.negative : budget.status === "WARNING" ? colors.warning : colors.positive;
  const body = (
    <View style={{ gap: 10, paddingVertical: onPress ? 10 : 12 }}>
      <Row>
        <IconBadge icon={budget.category.icon} color={budget.category.color} size={36} />
        <View style={{ flex: 1 }}>
          <Text weight="600" numberOfLines={1}>
            {budget.category.name}
          </Text>
          <Text variant="caption" tone="muted">
            <Money cents={budget.spentCents} variant="caption" weight="600" tone="muted" /> de <Money cents={budget.amountCents} variant="caption" tone="muted" weight="400" hideZeroCents />
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text weight="700" style={{ color }} tabular>
            {formatPct(budget.usedPct)}
          </Text>
          <Badge label={STATUS_LABEL[budget.status]} tone={STATUS_TONE[budget.status]} />
        </View>
      </Row>
      <ProgressBar value={budget.usedPct} color={color} />
    </View>
  );
  return onPress ? <PressableRow onPress={onPress}>{() => body}</PressableRow> : body;
}

/** Meta com progresso, valores e quanto guardar por mês. */
export function GoalCard({ goal, onPress }: { goal: Goal; onPress?: () => void }) {
  const { colors } = useTheme();
  const done = goal.status === "ACHIEVED";
  return (
    <Card onPress={onPress} style={{ gap: 14 }}>
      <Row>
        <IconBadge icon={goal.icon ?? GOAL_ICON[goal.kind]} color={goal.color ?? colors.primary} />
        <View style={{ flex: 1 }}>
          <Text weight="600" numberOfLines={1}>
            {goal.name}
          </Text>
          <Text variant="caption" tone="muted">
            {done ? "Meta atingida 🎉" : goal.deadline ? `Até ${formatDateShort(goal.deadline)}` : "Sem prazo"}
          </Text>
        </View>
        <Text variant="heading" tone={done ? "positive" : "primary"} tabular>
          {formatPct(goal.progressPct)}
        </Text>
      </Row>
      <ProgressBar value={goal.progressPct} color={done ? colors.positive : (goal.color ?? colors.primary)} height={10} />
      <Row style={{ justifyContent: "space-between" }}>
        <Money cents={goal.currentCents} variant="bodySm" weight="700" />
        <Text variant="caption" tone="muted">
          de <Money cents={goal.targetCents} variant="caption" tone="muted" weight="400" hideZeroCents />
        </Text>
      </Row>
      {goal.monthlyNeededCents ? (
        <Text variant="caption" tone="muted">
          Guarde <Money cents={goal.monthlyNeededCents} variant="caption" weight="600" /> por mês para chegar lá.
        </Text>
      ) : null}
    </Card>
  );
}

const GOAL_ICON: Record<Goal["kind"], string> = {
  EMERGENCY_FUND: "shield",
  TRAVEL: "plane",
  VEHICLE: "car",
  HOME: "house",
  EDUCATION: "graduation-cap",
  RETIREMENT: "sprout",
  EVENT: "party-popper",
  OTHER: "target",
};
export { GOAL_ICON };

/** Número do mês (Receitas / Despesas / Economia) com variação. */
export function SummaryTile({ label, cents, change, tone, goodWhenDown }: { label: string; cents: number; change?: number | null; tone: "positive" | "negative" | "primary"; goodWhenDown?: boolean }) {
  const { colors } = useTheme();
  const good = change === null || change === undefined ? null : goodWhenDown ? change <= 0 : change >= 0;
  return (
    <Card style={{ flex: 1, gap: 6, padding: 14 }}>
      <Row gap={6}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone === "positive" ? colors.positive : tone === "negative" ? colors.negative : colors.primary }} />
        <Text variant="caption" tone="muted" weight="600">
          {label}
        </Text>
      </Row>
      <Money cents={cents} variant="bodySm" weight="700" hideZeroCents style={{ fontSize: 17 }} animate />
      {change !== null && change !== undefined ? (
        <Text variant="caption" tone={good ? "positive" : "negative"} weight="600">
          {formatPct(change, { signed: true })} <Text variant="caption" tone="faint">vs mês anterior</Text>
        </Text>
      ) : (
        <Text variant="caption" tone="faint">
          —
        </Text>
      )}
    </Card>
  );
}

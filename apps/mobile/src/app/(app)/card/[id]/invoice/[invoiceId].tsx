import type { ISODate } from "@app/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { TransactionRow } from "@/components/feature/Rows";
import { Badge, Chip } from "@/components/ui/Controls";
import { Button } from "@/components/ui/Button";
import { DateField } from "@/components/ui/DateField";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { MoneyField } from "@/components/ui/Inputs";
import { Card, Divider, ListRow, IconBadge, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { api } from "@/lib/api/endpoints";
import { capitalize, formatDateShort, formatMonth } from "@/lib/format";
import { useAccounts, useApiMutation, useInvoice, useToday } from "@/lib/hooks";
import { confirmDialog } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";

const STATUS = { OPEN: { label: "Aberta", tone: "primary" }, CLOSED: { label: "Fechada", tone: "warning" }, PAID: { label: "Paga", tone: "positive" } } as const;

export default function InvoiceScreen() {
  const { id, invoiceId } = useLocalSearchParams<{ id: string; invoiceId: string }>();
  const { colors } = useTheme();
  const today = useToday();
  const { data: inv, isLoading, error, refetch, isRefetching } = useInvoice(id, invoiceId);
  const accounts = useAccounts().data?.data ?? [];
  const [payOpen, setPayOpen] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState<ISODate>(today);

  const pay = useApiMutation(
    () => api.cards.payInvoice(id!, invoiceId!, { accountId: accountId ?? accounts[0]!.id, amountCents: amount ?? undefined, paidOn: date }),
    { success: "Pagamento registrado", onSuccess: () => setPayOpen(false) },
  );
  const undo = useApiMutation((paymentId: string) => api.cards.removePayment(id!, invoiceId!, paymentId), { success: "Pagamento desfeito" });

  if (!inv) {
    return <Screen header={<ScreenHeader title="Fatura" />}>{isLoading ? <SkeletonCard lines={4} /> : <ErrorState error={error} onRetry={() => void refetch()} />}</Screen>;
  }

  const canPay = inv.remainingCents > 0 && inv.totalCents > 0;
  return (
    <Screen
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      header={<ScreenHeader title={`Fatura de ${capitalize(formatMonth(inv.referenceMonth))}`} subtitle={inv.card.name} />}
      footer={canPay ? <Button label={`Pagar fatura`} size="lg" onPress={() => { setAmount(inv.remainingCents); setPayOpen(true); }} /> : undefined}
    >
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="caption" tone="muted">
            Total da fatura
          </Text>
          <Badge label={STATUS[inv.status].label} tone={STATUS[inv.status].tone} />
        </View>
        <Money cents={inv.totalCents} variant="display" weight="700" />
        <View style={{ flexDirection: "row", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="muted">
              Fecha em
            </Text>
            <Text weight="600">{formatDateShort(inv.closingDate)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="muted">
              Vence em
            </Text>
            <Text weight="600">{formatDateShort(inv.dueDate)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="muted">
              Falta pagar
            </Text>
            <Money cents={inv.remainingCents} weight="700" tone={inv.remainingCents > 0 ? undefined : "positive"} />
          </View>
        </View>
      </Card>

      <Section title={`Compras (${inv.transactions.length})`}>
        <Card style={{ paddingVertical: 4 }}>
          {inv.transactions.length === 0 ? (
            <EmptyState icon="receipt" title="Sem compras nesta fatura" />
          ) : (
            inv.transactions.map((t, i) => (
              <View key={t.id}>
                {i > 0 ? <Divider inset={52} /> : null}
                <TransactionRow tx={t} showDate onPress={() => router.push(`/transaction/${t.id}` as never)} />
              </View>
            ))
          )}
        </Card>
      </Section>

      {inv.payments.length > 0 ? (
        <Section title="Pagamentos">
          <Card style={{ paddingVertical: 4 }}>
            {inv.payments.map((p, i) => (
              <View key={p.id}>
                {i > 0 ? <Divider inset={52} /> : null}
                <ListRow
                  title={`Pago com ${p.account.name}`}
                  subtitle={formatDateShort(p.paidOn)}
                  left={<IconBadge icon="circle-check" color={colors.positive} size={36} />}
                  right={<Money cents={p.amountCents} variant="bodySm" tone="positive" />}
                  onPress={async () => {
                    if (await confirmDialog({ title: "Desfazer pagamento?", message: "O valor volta para a conta e a fatura reabre.", confirmLabel: "Desfazer", destructive: true })) undo.mutate(p.id);
                  }}
                />
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      <Sheet visible={payOpen} onClose={() => setPayOpen(false)} title="Pagar fatura">
        <View style={{ gap: 16 }}>
          <MoneyField label="Valor" value={amount} onChange={setAmount} helper={`Falta pagar ${inv.remainingCents / 100 > 0 ? "" : ""}o restante ou escolha um valor parcial.`} />
          <View style={{ gap: 8 }}>
            <Text variant="caption" tone="muted" weight="600">
              Pagar com
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {accounts.map((a) => (
                <Chip key={a.id} label={a.name} selected={(accountId ?? accounts[0]?.id) === a.id} onPress={() => setAccountId(a.id)} />
              ))}
            </View>
          </View>
          <DateField label="Data do pagamento" value={date} onChange={setDate} today={today} />
          <Text variant="caption" tone="muted">
            O pagamento tira o valor da conta, mas não conta como nova despesa (a compra já foi contada).
          </Text>
          <Button label="Confirmar pagamento" loading={pay.isPending} disabled={accounts.length === 0 || !amount} onPress={() => pay.mutate(undefined)} />
        </View>
      </Sheet>
    </Screen>
  );
}

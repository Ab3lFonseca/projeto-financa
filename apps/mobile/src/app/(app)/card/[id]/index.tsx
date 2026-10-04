import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { CreditCardView } from "@/components/feature/Rows";
import { Badge, Segmented } from "@/components/ui/Controls";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Divider, IconBadge, ListRow, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { Text } from "@/components/ui/Text";
import { api, type Invoice } from "@/lib/api/endpoints";
import { capitalize, formatDateShort, formatMonth } from "@/lib/format";
import { useApiMutation, useCard, useInstallments, useInvoices } from "@/lib/hooks";
import { confirmDialog } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";

type Tab = "upcoming" | "history" | "installments";
const STATUS: Record<Invoice["status"], { label: string; tone: "primary" | "warning" | "positive" }> = {
  OPEN: { label: "Aberta", tone: "primary" },
  CLOSED: { label: "Fechada", tone: "warning" },
  PAID: { label: "Paga", tone: "positive" },
};

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/wallet" as never);
}

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>("upcoming");
  const card = useCard(id);
  const upcoming = useInvoices(id, "upcoming");
  const history = useInvoices(id, "history");
  const installments = useInstallments(id);
  const archive = useApiMutation((archived: boolean) => api.cards.update(id!, { archived }), { success: "Cartão atualizado" });
  const remove = useApiMutation(() => api.cards.remove(id!), { success: "Cartão excluído", onSuccess: goBack });

  if (!card.data) {
    return <Screen header={<ScreenHeader title="Cartão" />}>{card.isLoading ? <SkeletonCard /> : <ErrorState error={card.error} onRetry={() => void card.refetch()} />}</Screen>;
  }
  const c = card.data;
  const invoiceRows = tab === "upcoming" ? upcoming.data?.data : history.data?.data;

  return (
    <Screen
      refreshing={card.isRefetching}
      onRefresh={() => void Promise.all([card.refetch(), upcoming.refetch(), history.refetch(), installments.refetch()])}
      header={<ScreenHeader title={c.name} subtitle={`Fecha dia ${c.closingDay} · vence dia ${c.dueDay}`} right={<IconButton icon="pencil" label="Editar" onPress={() => router.push(`/card/${id}/edit` as never)} />} />}
    >
      <CreditCardView card={c} onPress={c.currentInvoice ? () => router.push(`/card/${id}/invoice/${c.currentInvoice!.id}` as never) : undefined} />
      <Card style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" tone="muted">
            Limite total
          </Text>
          <Money cents={c.limitCents} weight="700" hideZeroCents />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" tone="muted">
            Comprometido
          </Text>
          <Money cents={c.usedCents} weight="700" hideZeroCents />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" tone="muted">
            Disponível
          </Text>
          <Money cents={c.availableCents} weight="700" tone={c.availableCents < 0 ? "negative" : "positive"} hideZeroCents />
        </View>
      </Card>

      <Segmented<Tab> options={[{ value: "upcoming", label: "Faturas" }, { value: "installments", label: "Parceladas" }, { value: "history", label: "Histórico" }]} value={tab} onChange={setTab} />

      {tab === "installments" ? (
        <Section title="Compras parceladas em andamento">
          <Card style={{ paddingVertical: 4 }}>
            {(installments.data?.data ?? []).length === 0 ? (
              <EmptyState icon="credit-card" title="Nenhuma compra parcelada" message="Ao parcelar uma compra no cartão, ela aparece aqui." />
            ) : (
              installments.data!.data.map((p, i) => (
                <View key={p.groupId}>
                  {i > 0 ? <Divider inset={52} /> : null}
                  <ListRow
                    title={p.description}
                    subtitle={`Parcela ${p.currentNumber} de ${p.total} · faltam ${p.remainingCount}${p.nextDueDate ? ` · próxima vence ${formatDateShort(p.nextDueDate)}` : ""}`}
                    left={<IconBadge icon="credit-card" color={p.category?.color ?? colors.primary} size={36} />}
                    right={
                      <View style={{ alignItems: "flex-end" }}>
                        <Money cents={p.installmentCents} variant="bodySm" />
                        <Text variant="caption" tone="faint">
                          faltam <Money cents={p.remainingCents} variant="caption" tone="faint" weight="400" hideZeroCents />
                        </Text>
                      </View>
                    }
                  />
                </View>
              ))
            )}
          </Card>
        </Section>
      ) : (
        <Section title={tab === "upcoming" ? "Faturas atuais e próximas" : "Faturas anteriores"}>
          <Card style={{ paddingVertical: 4 }}>
            {!invoiceRows || invoiceRows.length === 0 ? (
              <EmptyState icon="receipt" title="Nenhuma fatura" message="As faturas aparecem conforme você registra compras no cartão." />
            ) : (
              invoiceRows.map((inv, i) => (
                <View key={inv.id}>
                  {i > 0 ? <Divider inset={52} /> : null}
                  <ListRow
                    title={`Fatura de ${capitalize(formatMonth(inv.referenceMonth))}`}
                    subtitle={`Fecha ${formatDateShort(inv.closingDate)} · vence ${formatDateShort(inv.dueDate)}`}
                    left={<IconBadge icon="receipt" color={colors.primary} size={36} />}
                    right={
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Money cents={inv.totalCents} variant="bodySm" />
                        <Badge label={STATUS[inv.status].label} tone={STATUS[inv.status].tone} />
                      </View>
                    }
                    chevron
                    onPress={() => router.push(`/card/${id}/invoice/${inv.id}` as never)}
                  />
                </View>
              ))
            )}
          </Card>
        </Section>
      )}

      <View style={{ gap: 8 }}>
        <Button label={c.archived ? "Desarquivar cartão" : "Arquivar cartão"} variant="secondary" loading={archive.isPending} onPress={() => archive.mutate(!c.archived)} />
        <Button
          label="Excluir cartão"
          variant="danger"
          loading={remove.isPending}
          onPress={async () => {
            if (await confirmDialog({ title: "Excluir cartão?", message: "Só é possível excluir cartões sem compras. Com histórico, arquive o cartão.", confirmLabel: "Excluir", destructive: true })) remove.mutate(undefined);
          }}
        />
      </View>
    </Screen>
  );
}

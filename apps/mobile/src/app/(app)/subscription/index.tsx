import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ShortcutRow } from "@/components/feature/Common";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/Button";
import { Badge, ProgressBar, SwitchRow } from "@/components/ui/Controls";
import { ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Divider, Reveal, Row, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import type { BillingIntervalName } from "@app/shared";
import { Pressable } from "react-native";
import { accessSummary, defaultInterval, formatPrice, planOffers, type PlanOffer } from "@/lib/access";
import { api } from "@/lib/api/endpoints";
import { useAuth, useMe } from "@/lib/auth/AuthProvider";
import { useApiMutation, useBilling } from "@/lib/hooks";
import { openExternal } from "@/lib/open-url";
import { toast } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";

const go = (p: string) => router.push(p as never);

const BENEFITS = [
  "Contas, cartões, orçamentos e metas sem limite",
  "Gráficos e relatórios completos, de qualquer período",
  "Seus dados em qualquer aparelho, com ou sem internet",
  "Exportação dos seus dados quando quiser",
  "Cancele quando quiser, sem multa",
];

/** Uma opção de plano (anual ou mensal): selo de economia calculado, valor total e, no anual, quanto dá por mês. */
function PlanCard({ offer, selected, disabled, onPress }: { offer: PlanOffer; selected: boolean; disabled?: boolean; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`Plano ${offer.label}: ${offer.total}`}
      disabled={disabled}
      onPress={onPress}
      style={{ padding: 14, gap: 4, borderRadius: radius.lg, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.primarySoft : colors.surface, opacity: disabled && !selected ? 0.5 : 1 }}
    >
      <Row style={{ justifyContent: "space-between" }}>
        <Text weight="700">{offer.label}</Text>
        {offer.savings !== null ? <Badge label={`Economize ${offer.savings}%`} tone="positive" /> : null}
      </Row>
      <Text variant="title">{offer.total}</Text>
      {offer.perMonth ? (
        <Text variant="caption" tone="muted">
          Equivale a {offer.perMonth}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Assinatura: situação atual, plano, adicional Rendimentos, pagar e gerenciar. Os preços vêm do provedor de pagamento. */
export default function SubscriptionScreen() {
  const me = useMe();
  const { refreshMe } = useAuth();
  const { colors } = useTheme();
  const billing = useBilling();
  const [withInvestments, setWithInvestments] = useState(false);
  const [chosen, setChosen] = useState<BillingIntervalName | null>(null);

  const b = billing.data;
  const access = b?.access ?? me.entitlements.access;
  const enforced = b?.enforced ?? me.entitlements.billingEnforced;
  const summary = accessSummary(access);
  const offers = planOffers(b?.prices.basic);
  // Quem ainda não assinou escolhe o ciclo (o anual vem marcado); quem já assina vê o ciclo que tem.
  const interval: BillingIntervalName = chosen && offers.some((o) => o.interval === chosen) ? chosen : defaultInterval(offers);
  const addonPrice = formatPrice(b?.prices.investments[access.state === "paid" ? (b?.interval ?? "month") : interval]);
  const canSubscribe = enforced && (access.state === "trial" || access.state === "expired") && !!b?.checkoutAvailable;
  const isPaid = access.state === "paid";
  const trialPct = access.state === "trial" && access.daysLeft !== null && b ? Math.max(0, Math.min(100, ((b.trialDays - access.daysLeft) / Math.max(1, b.trialDays)) * 100)) : null;

  const checkout = useApiMutation((v: { investments: boolean; interval: BillingIntervalName }) => api.billing.checkout(v.investments, v.interval), {
    onSuccess: (res) => {
      if (res.url) void openExternal(res.url);
      else {
        // Só no modo de desenvolvimento: a assinatura é ativada na hora, sem pagamento.
        toast.success("Assinatura ativada.");
        void refreshMe();
      }
    },
  });
  const portal = useApiMutation(() => api.billing.portal(), { onSuccess: (res) => void openExternal(res.url) });
  const addon = useApiMutation((enabled: boolean) => api.billing.addon(enabled), {
    onSuccess: (_d, enabled) => {
      toast.success(enabled ? "Rendimentos incluído na sua assinatura." : "Rendimentos removido da sua assinatura.");
      void refreshMe();
    },
  });

  const header = <ScreenHeader title="Assinatura" />;
  if (billing.isLoading && !b) {
    return (
      <Screen header={header}>
        <SkeletonCard lines={4} />
        <SkeletonCard />
      </Screen>
    );
  }

  return (
    <Screen header={header} refreshing={billing.isRefetching} onRefresh={() => void billing.refetch()}>
      <Reveal index={0}>
        <Card style={{ gap: 12 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text variant="heading">{summary.title}</Text>
            <Badge label={summary.badge.label} tone={summary.badge.tone} />
          </Row>
          <Text tone="muted">{summary.detail}</Text>
          {trialPct !== null ? <ProgressBar value={trialPct} /> : null}
        </Card>
      </Reveal>

      {billing.isError && !b ? <ErrorState error={billing.error} onRetry={() => void billing.refetch()} /> : null}

      {!enforced ? (
        <Reveal index={1}>
          <Card tone="primarySoft" style={{ gap: 6 }}>
            <Text weight="700">Sem cobrança por enquanto</Text>
            <Text variant="bodySm" tone="muted">
              O Finança está em lançamento e é gratuito para todos. Quando a assinatura começar, você será avisado(a) aqui com antecedência.
            </Text>
          </Card>
        </Reveal>
      ) : null}

      {enforced ? (
        <Reveal index={1}>
          <Section title="O que está incluído">
            <Card style={{ gap: 12 }}>
              {offers.length > 0 ? (
                <View style={{ gap: 10 }}>
                  {canSubscribe || offers.length > 1 ? (
                    <View accessibilityRole="radiogroup" accessibilityLabel="Escolha o plano" style={{ gap: 10 }}>
                      {offers.map((o) => (
                        <PlanCard key={o.interval} offer={o} selected={o.interval === (isPaid ? (b?.interval ?? interval) : interval)} disabled={isPaid} onPress={() => setChosen(o.interval)} />
                      ))}
                    </View>
                  ) : (
                    <Text variant="title">{offers[0]!.total}</Text>
                  )}
                  <Text variant="caption" tone="muted">
                    {access.state === "trial" ? "Seu teste grátis continua até o fim do prazo; só depois a cobrança começa." : "Cobrado pelo provedor de pagamento, com cancelamento a qualquer momento."}
                  </Text>
                </View>
              ) : (
                <Text tone="muted">O valor não pôde ser carregado agora. Puxe a tela para atualizar.</Text>
              )}
              <Divider />
              {BENEFITS.map((t) => (
                <Row key={t} gap={10} align="flex-start">
                  <Icon name="circle-check" size={18} color={colors.positive} />
                  <Text variant="bodySm" style={{ flex: 1 }}>
                    {t}
                  </Text>
                </Row>
              ))}
            </Card>
          </Section>
        </Reveal>
      ) : null}

      {enforced && b?.investmentsAvailable ? (
        <Reveal index={2}>
          <Card style={{ gap: 8 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Row gap={10}>
                <Icon name="piggy-bank" size={22} color={colors.primary} />
                <Text weight="700">Rendimentos</Text>
              </Row>
              {access.state === "trial" ? <Badge label="Incluído no teste" tone="positive" /> : addonPrice ? <Badge label={`+ ${addonPrice}`} /> : null}
            </Row>
            <Text variant="bodySm" tone="muted">
              Acompanhe o CDI e o CDB e traga o seu porquinho e seus investimentos: veja quanto rendem por dia, sem planilha. É um plano a mais, opcional.
            </Text>
            {canSubscribe ? (
              <SwitchRow
                title="Incluir na minha assinatura"
                subtitle={addonPrice ? `Soma ${addonPrice} ao plano` : "Ainda não está disponível neste plano"}
                value={withInvestments && !!addonPrice}
                disabled={!addonPrice}
                onChange={setWithInvestments}
              />
            ) : null}
            {isPaid && b.canManage ? (
              <SwitchRow
                title="Rendimentos na minha assinatura"
                subtitle={b.hasInvestmentsAddon ? "Ativo" : "Inativo"}
                value={b.hasInvestmentsAddon}
                disabled={addon.isPending}
                onChange={(v) => addon.mutate(v)}
              />
            ) : null}
            {access.state === "complimentary" || access.state === "admin" ? (
              <Text variant="caption" tone="faint">
                {access.features.investments ? "Incluído no seu acesso." : "Não incluído no seu acesso gratuito."}
              </Text>
            ) : null}
          </Card>
        </Reveal>
      ) : null}

      {canSubscribe ? (
        <Button
          label={access.state === "trial" ? "Assinar agora" : "Assinar e voltar a editar"}
          size="lg"
          icon="crown"
          loading={checkout.isPending}
          onPress={() => checkout.mutate({ investments: withInvestments && !!b?.prices.investments[interval], interval })}
        />
      ) : null}
      {enforced && !b?.checkoutAvailable && (access.state === "trial" || access.state === "expired") && b ? (
        <Text variant="bodySm" tone="muted" align="center">
          A assinatura ainda não está disponível neste momento.
        </Text>
      ) : null}
      {isPaid && b?.canManage ? (
        <Button label="Gerenciar assinatura" variant="secondary" icon="credit-card" loading={portal.isPending} onPress={() => portal.mutate(undefined)} />
      ) : null}
      {isPaid && b?.canManage ? (
        <Text variant="caption" tone="faint" align="center">
          Troque o cartão, veja suas faturas ou cancele na página segura do provedor de pagamento.
        </Text>
      ) : null}

      <Card style={{ paddingVertical: 6 }}>
        <ShortcutRow icon="sparkles" title="Novidades e o que vem por aí" subtitle="Veja o que já chegou e o que estamos preparando" onPress={() => go("/updates")} color={colors.accent} />
        <Divider inset={52} />
        <ShortcutRow icon="shield-check" title="Privacidade e dados" subtitle="Exportar ou excluir seus dados" onPress={() => go("/settings/privacy")} color="#14B8A6" />
      </Card>

      {enforced ? (
        <Row style={{ justifyContent: "center" }} gap={6}>
          <Icon name="lock" size={14} color={colors.textFaint} />
          <Text variant="caption" tone="faint" style={{ flexShrink: 1 }}>
            O pagamento acontece na página segura do provedor. O Finança nunca vê nem guarda os dados do seu cartão.
          </Text>
        </Row>
      ) : null}
    </Screen>
  );
}

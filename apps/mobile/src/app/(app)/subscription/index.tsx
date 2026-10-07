import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { ShortcutRow } from "@/components/feature/Common";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/Button";
import { Badge, ProgressBar, Segmented, SwitchRow } from "@/components/ui/Controls";
import { ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Divider, Reveal, Row, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import type { BillingIntervalName, BillingModeName } from "@app/shared";
import { Pressable } from "react-native";
import { accessSummary, defaultInterval, formatPrice, PAYMENT_MODE_OPTIONS, paymentModeHint, planOffers, type PlanOffer } from "@/lib/access";
import { api } from "@/lib/api/endpoints";
import { useAuth, useMe } from "@/lib/auth/AuthProvider";
import { celebrate } from "@/lib/celebrate";
import { useApiMutation, useBilling } from "@/lib/hooks";
import { reserveExternalTab, type ReservedTab } from "@/lib/open-url";
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
      accessibilityLabel={`Plano ${offer.label}: ${offer.discountedTotal ? `${offer.discountedTotal}, com desconto das insígnias` : offer.total}`}
      disabled={disabled}
      onPress={onPress}
      style={{ padding: 14, gap: 4, borderRadius: radius.lg, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.primarySoft : colors.surface, opacity: disabled && !selected ? 0.5 : 1 }}
    >
      <Row style={{ justifyContent: "space-between" }}>
        <Text weight="700">{offer.label}</Text>
        {offer.savings !== null ? <Badge label={`Economize ${offer.savings}%`} tone="positive" /> : null}
      </Row>
      {offer.discountedTotal ? (
        <>
          {/* com desconto de insígnias: o preço cheio riscado e o valor final em destaque */}
          <Text variant="caption" tone="muted" style={{ textDecorationLine: "line-through" }}>
            {offer.total}
          </Text>
          <Text variant="title">{offer.discountedTotal}</Text>
        </>
      ) : (
        <Text variant="title">{offer.total}</Text>
      )}
      {offer.perMonth ? (
        <Text variant="caption" tone="muted">
          Equivale a {offer.discountedPerMonth ?? offer.perMonth}
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
  // Enquanto a pessoa paga na outra aba (ou no navegador), a tela confere o pagamento de tempos em tempos.
  const [waiting, setWaiting] = useState<{ wasPaid: boolean; daysBefore: number | null } | null>(null);
  const billing = useBilling(waiting !== null);
  const [withInvestments, setWithInvestments] = useState(false);
  const [chosen, setChosen] = useState<BillingIntervalName | null>(null);
  const [mode, setMode] = useState<BillingModeName>("recurring");

  const b = billing.data;
  const access = b?.access ?? me.entitlements.access;
  const enforced = b?.enforced ?? me.entitlements.billingEnforced;
  const autoRenew = b?.autoRenew ?? null;
  const summary = accessSummary(access, autoRenew);
  const discountPercent = b?.discount.percent ?? 0;
  const offers = planOffers(b?.prices.basic, discountPercent);
  const isPaid = access.state === "paid";
  // Quem pagou uma vez (não renova sozinho) pode pagar de novo para estender o prazo.
  const renewable = enforced && isPaid && autoRenew === false && !!b?.checkoutAvailable;
  const canSubscribe = enforced && (access.state === "trial" || access.state === "expired") && !!b?.checkoutAvailable;
  const canPay = canSubscribe || renewable;
  // Quem ainda não assinou escolhe o ciclo (o anual vem marcado); quem já assina vê o ciclo que tem (e quem vai renovar parte do mesmo).
  const own = renewable && b?.interval && offers.some((o) => o.interval === b.interval) ? b.interval : null;
  const interval: BillingIntervalName = chosen && offers.some((o) => o.interval === chosen) ? chosen : (own ?? defaultInterval(offers));
  const payMode: BillingModeName = renewable ? "once" : mode;
  const showingOwnPlan = isPaid && !renewable;
  const addonPrice = formatPrice(b?.prices.investments[showingOwnPlan ? (b?.interval ?? "month") : interval]);
  const trialPct = access.state === "trial" && access.daysLeft !== null && b ? Math.max(0, Math.min(100, ((b.trialDays - access.daysLeft) / Math.max(1, b.trialDays)) * 100)) : null;

  // O pagamento só vale quando o servidor confirma no provedor: a tela relê o estado e comemora quando o acesso aparece (ou o prazo cresce).
  useEffect(() => {
    if (!waiting || !b) return;
    const paidNow = b.access.state === "paid";
    if (paidNow && (!waiting.wasPaid || (b.access.daysLeft ?? 0) > (waiting.daysBefore ?? 0))) {
      setWaiting(null);
      void refreshMe();
      celebrate({ kind: "premium", title: waiting.wasPaid ? "Plano renovado!" : "Pagamento confirmado!", message: waiting.wasPaid ? "Seu prazo foi estendido. Obrigado por continuar com a gente." : "Obrigado! Tudo está liberado para você." });
    }
  }, [b, waiting, refreshMe]);
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setWaiting(null), 15 * 60_000); // Pix pode demorar, mas não esperamos para sempre
    return () => clearTimeout(t);
  }, [waiting]);

  const checkout = useApiMutation(
    async (v: { investments: boolean; interval: BillingIntervalName; mode: BillingModeName; tab: ReservedTab }) => {
      try {
        return { ...(await api.billing.checkout(v.investments, v.interval, v.mode)), tab: v.tab };
      } catch (err) {
        v.tab.close(); // não há o que abrir: não deixa uma aba em branco
        throw err;
      }
    },
    {
      onSuccess: (res) => {
        if (res.url) {
          res.tab.go(res.url);
          setWaiting({ wasPaid: isPaid, daysBefore: access.daysLeft });
        } else {
          // Só no modo de desenvolvimento: o acesso é ativado na hora, sem pagamento.
          res.tab.close();
          toast.success(payMode === "once" ? "Plano ativado." : "Assinatura ativada.");
          void refreshMe();
        }
      },
    },
  );
  /** A aba do pagamento é reservada AQUI, no toque (antes da API responder), senão o navegador bloqueia a janela. */
  const pay = () => checkout.mutate({ investments: withInvestments && !!b?.prices.investments[interval], interval, mode: payMode, tab: reserveExternalTab() });
  const period = interval === "year" ? "1 ano" : "30 dias";
  const portal = useApiMutation(
    async (tab: ReservedTab) => {
      try {
        return { ...(await api.billing.portal()), tab };
      } catch (err) {
        tab.close();
        throw err;
      }
    },
    { onSuccess: (res) => res.tab.go(res.url) },
  );
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
                  {canPay || offers.length > 1 ? (
                    <View accessibilityRole="radiogroup" accessibilityLabel="Escolha o plano" style={{ gap: 10 }}>
                      {offers.map((o) => (
                        <PlanCard key={o.interval} offer={o} selected={o.interval === (showingOwnPlan ? (b?.interval ?? interval) : interval)} disabled={showingOwnPlan || waiting !== null} onPress={() => setChosen(o.interval)} />
                      ))}
                    </View>
                  ) : (
                    <Text variant="title">{offers[0]!.total}</Text>
                  )}
                  {b ? (
                    <Pressable accessibilityRole="button" onPress={() => go("/badges")} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Icon name="percent" size={16} color={colors.positive} />
                      <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                        {discountPercent > 0
                          ? `Desconto de ${discountPercent}% das suas insígnias aplicado. Veja como ganhar mais.`
                          : `Ganhe de 5% a ${b.discount.capPercent}% de desconto com insígnias no nível Ouro ou acima. Veja como.`}
                      </Text>
                    </Pressable>
                  ) : null}
                  {canSubscribe && waiting === null ? (
                    <View style={{ gap: 6 }}>
                      <Segmented options={PAYMENT_MODE_OPTIONS} value={mode} onChange={setMode} />
                      <Text variant="caption" tone="muted">
                        {paymentModeHint(mode, interval)}
                      </Text>
                    </View>
                  ) : null}
                  <Text variant="caption" tone="muted">
                    {access.state === "trial"
                      ? "Seu teste grátis continua até o fim do prazo; só depois a cobrança começa."
                      : renewable
                        ? `Renovar soma ${period} ao fim do seu prazo atual, sem perder nenhum dia. Aceita Pix e cartão.`
                        : autoRenew === false
                          ? "Plano pago uma vez: não renova sozinho."
                          : "Cobrado pelo provedor de pagamento, com cancelamento a qualquer momento."}
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
            {canPay ? (
              <SwitchRow
                title={renewable ? "Incluir na renovação" : "Incluir na minha assinatura"}
                subtitle={addonPrice ? `Soma ${addonPrice} ao plano` : "Ainda não está disponível neste plano"}
                value={withInvestments && !!addonPrice}
                disabled={!addonPrice || waiting !== null}
                onChange={setWithInvestments}
              />
            ) : null}
            {isPaid && b.canManage && autoRenew !== false ? (
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

      {waiting !== null ? (
        <Card tone="primarySoft" style={{ gap: 10, alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
          <Text weight="700" align="center">
            Aguardando o pagamento
          </Text>
          <Text variant="bodySm" tone="muted" align="center">
            Conclua o pagamento na página que abrimos. Pix pode levar alguns instantes para confirmar. Esta tela atualiza sozinha e libera tudo assim que o pagamento for confirmado.
          </Text>
          <Button label="Já paguei: verificar agora" variant="secondary" loading={billing.isFetching} onPress={() => void billing.refetch()} />
          <Button label="Parar de esperar" variant="ghost" onPress={() => setWaiting(null)} />
        </Card>
      ) : canPay ? (
        <Button
          label={
            renewable
              ? `Renovar por ${period}`
              : payMode === "once"
                ? `Pagar ${period} (Pix ou cartão)`
                : access.state === "trial"
                  ? "Assinar agora"
                  : "Assinar e voltar a editar"
          }
          size="lg"
          icon="crown"
          loading={checkout.isPending}
          onPress={pay}
        />
      ) : null}
      {enforced && !b?.checkoutAvailable && (access.state === "trial" || access.state === "expired") && b ? (
        <Text variant="bodySm" tone="muted" align="center">
          A assinatura ainda não está disponível neste momento.
        </Text>
      ) : null}
      {isPaid && b?.canManage && autoRenew !== false ? (
        <Button label="Gerenciar assinatura" variant="secondary" icon="credit-card" loading={portal.isPending} onPress={() => portal.mutate(reserveExternalTab())} />
      ) : null}
      {isPaid && b?.canManage && autoRenew !== false ? (
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

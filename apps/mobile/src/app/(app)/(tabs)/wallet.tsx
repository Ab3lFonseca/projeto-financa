import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Icon } from "@/components/Icon";
import { AccountTile, CreditCardView } from "@/components/feature/Rows";
import { TourTarget } from "@/components/tour/TourTarget";
import { Button } from "@/components/ui/Button";
import { Badge, Segmented } from "@/components/ui/Controls";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Reveal, Row, Screen, Section } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { Text } from "@/components/ui/Text";
import { useAccounts, useBankEntry, useBankOverview, useCards, useSyncStaleConnections } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeProvider";

type Tab = "accounts" | "cards";
const go = (p: string) => router.push(p as never);

export default function WalletScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "cards" ? "cards" : "accounts");
  const accounts = useAccounts();
  const cards = useCards();
  // Dados do banco (Open Finance): releitura automática ao abrir e a cada minuto, só do que o servidor já guardou.
  const overview = useBankOverview();
  useSyncStaleConnections(30);
  const bankAccounts = new Map((overview.data?.accounts ?? []).map((a) => [a.accountId, a]));
  const bankCards = new Map((overview.data?.cards ?? []).map((c) => [c.cardId, c]));

  const list = accounts.data?.data ?? [];
  const total = list.filter((a) => a.includeInTotal).reduce((s, a) => s + a.balanceCents, 0);
  const cardList = cards.data?.data ?? [];
  // Cartões ligados ao banco entram nos totais com os números do banco.
  const totalLimit = cardList.reduce((s, c) => s + (bankCards.get(c.id)?.limitCents ?? c.limitCents), 0);
  const totalUsed = cardList.reduce((s, c) => s + (bankCards.get(c.id)?.usedCents ?? c.usedCents), 0);
  const active = tab === "accounts" ? accounts : cards;

  const header = (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
      <Text variant="title">Carteira</Text>
      <TourTarget id="wallet-tabs">
        <Segmented<Tab> options={[{ value: "accounts", label: "Contas" }, { value: "cards", label: "Cartões" }]} value={tab} onChange={setTab} />
      </TourTarget>
    </View>
  );

  return (
    <Screen tabs header={header} refreshing={active.isRefetching} onRefresh={() => void Promise.all([accounts.refetch(), cards.refetch()])}>
      {tab === "accounts" ? (
        accounts.isLoading && !accounts.data ? (
          <SkeletonCard />
        ) : accounts.isError && !accounts.data ? (
          <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />
        ) : (
          <>
            <Reveal>
              <Card style={{ gap: 4 }}>
                <Text variant="caption" tone="muted">
                  Saldo nas contas
                </Text>
                <Money cents={total} variant="title" weight="700" tone={total < 0 ? "negative" : undefined} />
                <Text variant="caption" tone="faint">
                  {list.length} conta{list.length === 1 ? "" : "s"}
                </Text>
              </Card>
            </Reveal>
            {list.length === 0 ? (
              <Card>
                <EmptyState icon="landmark" title="Nenhuma conta ainda" message="Cadastre sua conta bancária ou carteira para começar." action="Criar conta" onAction={() => go("/account/new")} />
              </Card>
            ) : (
              <Section title="Suas contas">
                <View style={{ gap: 12 }}>
                  {list.map((a, i) => (
                    <Reveal key={a.id} index={i + 1}>
                      <AccountTile account={a} bank={bankAccounts.get(a.id)} onPress={() => go(`/account/${a.id}`)} />
                    </Reveal>
                  ))}
                </View>
              </Section>
            )}
            <Button label="Adicionar conta" icon="plus" variant="secondary" onPress={() => go("/account/new")} />
            <OpenFinanceCard />
          </>
        )
      ) : cards.isLoading && !cards.data ? (
        <SkeletonCard />
      ) : cards.isError && !cards.data ? (
        <ErrorState error={cards.error} onRetry={() => void cards.refetch()} />
      ) : (
        <>
          {cardList.length > 0 ? (
            <Reveal>
              <Card style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="caption" tone="muted">
                    Limite total
                  </Text>
                  <Money cents={totalLimit} weight="700" hideZeroCents />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="caption" tone="muted">
                    Comprometido
                  </Text>
                  <Money cents={totalUsed} weight="700" hideZeroCents />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="caption" tone="muted">
                    Disponível
                  </Text>
                  <Money cents={totalLimit - totalUsed} weight="700" tone="positive" hideZeroCents />
                </View>
              </Card>
            </Reveal>
          ) : null}
          {cardList.length === 0 ? (
            <Card>
              <EmptyState icon="credit-card" title="Nenhum cartão cadastrado" message="Cadastre um cartão para acompanhar fatura, limite e parcelas." action="Adicionar cartão" onAction={() => go("/card/new")} />
            </Card>
          ) : (
            <View style={{ gap: 12 }}>
              {cardList.map((c, i) => (
                <Reveal key={c.id} index={i + 1}>
                  <CreditCardView card={c} bank={bankCards.get(c.id)} onPress={() => go(`/card/${c.id}`)} />
                </Reveal>
              ))}
            </View>
          )}
          <Button label="Adicionar cartão" icon="plus" variant="secondary" onPress={() => go("/card/new")} />
        </>
      )}
      <View style={{ height: 8 }} />
      <Row style={{ justifyContent: "center" }} gap={6}>
        <Icon name="shield-check" size={14} color={colors.textFaint} />
        <Text variant="caption" tone="faint">
          Nunca pedimos senhas de banco nem números completos de cartão.
        </Text>
      </Row>
    </Screen>
  );
}

/**
 * Convite para conectar bancos automaticamente. A conexão ainda não foi lançada para o público: o cartão mostra "Em breve" e leva à explicação
 * (para que serve, como vai funcionar, o que esperar). Só quando o recurso está ligado no servidor ele abre a conexão de verdade.
 */
function OpenFinanceCard() {
  const { colors, radius } = useTheme();
  const bank = useBankEntry();
  return (
    <Card onPress={() => go(bank.href)} tone="primarySoft" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
        <Icon name="link" size={22} color={colors.onPrimary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Row gap={8}>
          <Text weight="700" style={{ flexShrink: 1 }}>
            {bank.enabled ? "Conectar banco automaticamente" : "Conexão automática com bancos"}
          </Text>
          {bank.enabled ? null : <Badge label="Em breve" tone="warning" />}
        </Row>
        <Text variant="bodySm" tone="muted">
          {bank.enabled ? "Traga saldos e transações do seu banco com segurança." : "Traga saldos e movimentações do seu banco sem digitar. Toque para ver como vai funcionar."}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color={colors.textMuted} />
    </Card>
  );
}

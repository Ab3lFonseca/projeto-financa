import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { DonutChart, Legend } from "@/components/charts/Charts";
import { InvestmentCard } from "@/components/feature/InvestmentCard";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Reveal, Row, Screen, Section } from "@/components/ui/Layout";
import { Money } from "@/components/ui/Money";
import { Text } from "@/components/ui/Text";
import { api } from "@/lib/api/endpoints";
import { formatAgo, formatPct } from "@/lib/format";
import { useBankConnections, useBankEntry, useInvestments, useOpenFinanceStatus, useSyncStaleConnections } from "@/lib/hooks";
import { toast } from "@/lib/ui-store";
import { COLOR_CHOICES } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useQueryClient } from "@tanstack/react-query";

const go = (p: string) => router.push(p as never);

/** Investimentos que vêm do banco (CDB, caixinhas, cofrinhos, porquinhos, LCI/LCA, fundos...). */
export default function InvestmentsScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const bank = useBankEntry();
  const status = useOpenFinanceStatus();
  // Open Finance desligado (ou sem resposta): é só a tela padrão "em breve", sem buscar conexões nem investimentos (era isso que deixava a aba lenta).
  const live = bank.enabled;
  const connections = useBankConnections(live);
  const inv = useInvestments(live);
  const [refreshing, setRefreshing] = useState(false);
  useSyncStaleConnections(30, live);

  const conns = connections.data?.data ?? [];
  const lastSync = conns.map((c) => c.lastSyncAt).filter((x): x is string => !!x).sort().at(-1) ?? null;

  /** Relê do banco o que o provedor já guardou de todas as conexões (não consome a cota mensal do Open Finance). */
  const refresh = async () => {
    setRefreshing(true);
    try {
      for (const c of conns) await api.openFinance.sync(c.id).catch(() => undefined);
      await qc.invalidateQueries();
      toast.info("Valores atualizados com o que o banco informou por último.");
    } finally {
      setRefreshing(false);
    }
  };

  const header = (
    <Row style={{ paddingHorizontal: 16, paddingTop: 8, justifyContent: "space-between" }}>
      <View>
        <Text variant="title">Investimentos</Text>
        {conns.length > 0 ? (
          <Text variant="caption" tone="muted">
            Atualizado {formatAgo(lastSync)} · automático
          </Text>
        ) : null}
      </View>
      {conns.length > 0 ? <IconButton icon="refresh-cw" label="Atualizar valores" onPress={() => void refresh()} /> : null}
    </Row>
  );

  // Só espera a rede quando o Open Finance está ligado; antes de saber se está, espera apenas a resposta rápida do status.
  const loading = live ? (inv.isLoading && !inv.data) || (connections.isLoading && !connections.data) : status.isLoading && !status.data;
  const data = inv.data;

  return (
    <Screen tabs header={header} refreshing={refreshing || inv.isRefetching} onRefresh={() => void refresh()}>
      {loading ? (
        <SkeletonCard lines={5} />
      ) : inv.isError && !data ? (
        <ErrorState error={inv.error} onRetry={() => void inv.refetch()} />
      ) : conns.length === 0 && (data?.items.length ?? 0) === 0 ? (
        <Card style={{ gap: 14 }}>
          {bank.enabled ? (
            <>
              <EmptyState
                icon="piggy-bank"
                title="Veja seus investimentos aqui"
                message="Conecte seu banco e o app traz sozinho seus CDBs, caixinhas, cofrinhos, porquinhos, LCI/LCA e fundos, com o rendimento atualizado todos os dias."
              />
              <Button label="Conectar meu banco" icon="link" size="lg" onPress={() => go(bank.href)} />
            </>
          ) : (
            <>
              <EmptyState
                icon="piggy-bank"
                title="Seus investimentos, em breve"
                message="Estamos preparando o acompanhamento de CDI, CDB e do seu porquinho, e a conexão automática com bancos. Veja como vai funcionar."
              />
              <Button label="Ver como vai funcionar" icon="sparkles" size="lg" onPress={() => go("/updates?item=investments")} />
              <Button label="Conexão com bancos" variant="ghost" onPress={() => go(bank.href)} />
            </>
          )}
        </Card>
      ) : !data || data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon="piggy-bank"
            title="Nenhum investimento encontrado"
            message="Seu banco não informou investimentos (ou essa permissão não foi dada ao conectar). Você pode reconectar e autorizar o compartilhamento de investimentos."
            action="Ver conexões"
            onAction={() => go("/open-finance")}
          />
        </Card>
      ) : (
        <>
          <Reveal>
            <Card style={{ gap: 14 }}>
              <View style={{ gap: 2 }}>
                <Text variant="caption" tone="muted">
                  Total investido hoje
                </Text>
                <Money cents={data.summary.totalCents} variant="display" weight="700" />
              </View>
              <Row style={{ gap: 24 }}>
                <View style={{ gap: 2 }}>
                  <Text variant="caption" tone="muted">
                    Aplicado
                  </Text>
                  <Money cents={data.summary.investedCents} variant="bodySm" weight="600" />
                </View>
                <View style={{ gap: 2 }}>
                  <Text variant="caption" tone="muted">
                    Rendimento
                  </Text>
                  <Row gap={6}>
                    <Money cents={data.summary.profitCents} signed colorize variant="bodySm" weight="700" />
                    {data.summary.profitPct !== null ? (
                      <Text variant="caption" tone={data.summary.profitCents >= 0 ? "positive" : "negative"} weight="600">
                        ({formatPct(data.summary.profitPct, { signed: true })})
                      </Text>
                    ) : null}
                  </Row>
                </View>
              </Row>
            </Card>
          </Reveal>

          {data.groups.length > 1 ? (
            <Reveal index={1}>
              <Card style={{ gap: 14, alignItems: "center" }}>
                <DonutChart data={data.groups.map((g, i) => ({ value: g.totalCents, color: COLOR_CHOICES[i % COLOR_CHOICES.length]!, label: g.label }))} size={160} thickness={22}>
                  <Text variant="caption" tone="muted">
                    {data.summary.count} {data.summary.count === 1 ? "aplicação" : "aplicações"}
                  </Text>
                </DonutChart>
                <Legend
                  items={data.groups.map((g, i) => ({
                    color: COLOR_CHOICES[i % COLOR_CHOICES.length]!,
                    label: `${g.label} · ${formatPct(data.summary.totalCents > 0 ? (g.totalCents / data.summary.totalCents) * 100 : 0)}`,
                  }))}
                />
              </Card>
            </Reveal>
          ) : null}

          <Section title="Suas aplicações">
            <View style={{ gap: 12 }}>
              {data.items.map((item, i) => (
                <Reveal key={item.id} index={i + 2}>
                  <InvestmentCard item={item} onPress={() => go(`/investments/${item.id}`)} />
                </Reveal>
              ))}
            </View>
          </Section>

          <Text variant="caption" tone="faint" align="center">
            Valores e rendimentos como o banco informa pelo Open Finance. Eles se atualizam sozinhos uma vez ao dia; o banco limita quantas
            consultas podem ser feitas por mês.
          </Text>
          <Button label="Gerenciar conexões" variant="ghost" size="sm" onPress={() => go("/open-finance")} />
        </>
      )}
      <View style={{ height: 4 }} />
      <Row style={{ justifyContent: "center", paddingBottom: 4 }} gap={6}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.positive }} />
        <Text variant="caption" tone="faint">
          Somente leitura: o app não movimenta seu dinheiro.
        </Text>
      </Row>
    </Screen>
  );
}

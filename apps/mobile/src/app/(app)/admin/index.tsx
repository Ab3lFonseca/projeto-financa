import { router } from "expo-router";
import { View } from "react-native";
import { AdminGate } from "@/components/AdminGate";
import { StatTile } from "@/components/admin/StatTile";
import { BarChart } from "@/components/charts/Charts";
import { ShortcutRow } from "@/components/feature/Common";
import { Badge, ProgressBar } from "@/components/ui/Controls";
import { Banner, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Divider, IconBadge, ListRow, Reveal, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { formatMoneyCents } from "@/lib/access";
import { fillSignups, onboardingRate, themeRows } from "@/lib/admin";
import { useAdminIntegrations, useAdminStats, useAdminSuggestions, useToday } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeProvider";

const go = (path: string) => router.push(path as never);

/** Painel do administrador: números do app e das contas. Nunca saldos, lançamentos nem dados de bancos de ninguém. */
export default function AdminDashboardScreen() {
  return (
    <AdminGate>
      <Dashboard />
    </AdminGate>
  );
}

function Dashboard() {
  const { colors } = useTheme();
  const today = useToday();
  const stats = useAdminStats();
  const integrations = useAdminIntegrations();
  const pendingSuggestions = useAdminSuggestions("PENDING").data?.counts.PENDING ?? null;
  const refreshing = stats.isRefetching || integrations.isRefetching;
  const header = <ScreenHeader title="Administração" subtitle="Visão geral do app" />;
  const refresh = () => void Promise.all([stats.refetch(), integrations.refetch()]);

  if (stats.isLoading && !stats.data) {
    return (
      <Screen header={header}>
        <SkeletonCard />
        <SkeletonCard lines={4} />
      </Screen>
    );
  }
  if (stats.isError && !stats.data) {
    return (
      <Screen header={header}>
        <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
      </Screen>
    );
  }
  if (!stats.data) return null;

  const { users, signupsByDay, themes, billing } = stats.data;
  const days = fillSignups(signupsByDay, today, 30);
  const rate = onboardingRate(users.onboardingCompleted, users.total);
  const rows = themeRows(themes);
  const ofi = integrations.data;

  return (
    <Screen header={header} refreshing={refreshing} onRefresh={refresh}>
      <Banner tone="info" icon="shield-check">
        Só você vê esta área. Aqui ficam números do app e dados de cadastro (nome, e-mail, plano). Não há saldos, lançamentos nem bancos conectados de ninguém.
      </Banner>

      <Reveal index={0}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <StatTile label="Usuários" value={users.total} tone="primary" hint={`${users.active} ativos`} />
          <StatTile label="Novos em 7 dias" value={users.newLast7Days} tone="positive" hint={`${users.newLast30Days} em 30 dias`} />
          <StatTile label="Ativos em 7 dias" value={users.activeLast7Days} tone="primary" hint="usaram o app" />
          <StatTile label="Concluíram o tutorial" value={rate ?? 0} suffix="%" tone="positive" hint={`${users.onboardingCompleted} de ${users.total}`} />
          <StatTile label="Premium" value={users.premium} tone="primary" />
          <StatTile label="Com verificação em 2 etapas" value={users.mfaEnabled} tone="positive" hint={`${users.total > 0 ? Math.round((users.mfaEnabled / users.total) * 100) : 0}% das contas`} />
          <StatTile label="Suspensos" value={users.suspended} tone={users.suspended > 0 ? "negative" : "primary"} />
        </View>
      </Reveal>

      <Reveal index={1}>
        <Section title="Assinaturas">
          {billing.enforced ? null : (
            <Banner tone="info" icon="info">
              A cobrança está desligada (beta). Os números mostram como ficaria quando ela começar.
            </Banner>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <StatTile label="Em teste grátis" value={billing.trial} tone="primary" />
            <StatTile label="Assinantes" value={billing.paid} tone="positive" />
            <StatTile label="Cortesias" value={billing.complimentary} tone="primary" hint="acesso sem pagar" />
            <StatTile label="Teste vencido" value={billing.expired} tone={billing.expired > 0 ? "negative" : "primary"} hint="somente leitura" />
            <StatTile label="Com Rendimentos" value={billing.investmentsAddon} tone="primary" />
          </View>
          <Card style={{ gap: 4 }}>
            <Text variant="caption" tone="muted" weight="600">
              Receita mensal estimada
            </Text>
            <Text variant="title" weight="700" tabular>
              {billing.monthlyRevenueCents !== null ? formatMoneyCents(billing.monthlyRevenueCents, billing.currency ?? "BRL") : "—"}
            </Text>
            <Text variant="caption" tone="faint">
              {billing.monthlyRevenueCents !== null
                ? "Assinantes × preço do plano (e do adicional) lido do provedor. Cortesias não entram."
                : "Aparece quando o provedor de pagamento estiver configurado."}
            </Text>
          </Card>
        </Section>
      </Reveal>

      <Reveal index={2}>
        <Section title="Cadastros nos últimos 30 dias" action="Ver usuários" onAction={() => go("/admin/users")}>
          <Card>
            <BarChart
              data={days.map((d, i) => ({
                key: d.date,
                // Só o dia de hoje e de 7 em 7 dias para trás recebem rótulo, para o eixo não ficar apertado.
                label: (days.length - 1 - i) % 7 === 0 ? `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}` : "",
                detail: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}/${d.date.slice(0, 4)}`,
                values: [d.count],
              }))}
              colors={[colors.accent]}
              seriesLabels={["Cadastros"]}
              height={170}
              empty="Nenhum cadastro nos últimos 30 dias"
              axisFormat={(v) => String(Math.round(v))}
              valueFormat={(v) => `${v}`}
            />
          </Card>
        </Section>
      </Reveal>

      <Reveal index={2}>
        <Section title="Temas escolhidos">
          <Card style={{ gap: 14 }}>
            {rows.length === 0 ? (
              <Text tone="muted">Ainda não há usuários.</Text>
            ) : (
              rows.map((r) => (
                <View key={r.id} style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                    <Text weight="500">
                      {r.emoji} {r.label}
                    </Text>
                    <Text variant="bodySm" tone="muted" tabular>
                      {r.count} · {r.pct}%
                    </Text>
                  </View>
                  <ProgressBar value={r.pct} height={8} />
                </View>
              ))
            )}
          </Card>
        </Section>
      </Reveal>

      <Reveal index={3}>
        <Section title="Sistema">
          <Card style={{ paddingVertical: 6 }}>
            {integrations.isError && !ofi ? (
              <ErrorState error={integrations.error} onRetry={() => void integrations.refetch()} />
            ) : (
              <>
                <ListRow
                  title="Login (Supabase)"
                  left={<IconBadge icon="lock" color={colors.primary} size={36} />}
                  right={ofi ? <Badge label={ofi.auth.configured ? "Configurado" : "Faltando"} tone={ofi.auth.configured ? "positive" : "negative"} /> : undefined}
                />
                <Divider inset={48} />
                <ListRow
                  title="Open Finance"
                  subtitle={ofi ? (ofi.openFinance.configured ? "Credenciais cadastradas" : "Sem credenciais do provedor") : undefined}
                  left={<IconBadge icon="link" color="#0EA5E9" size={36} />}
                  right={ofi ? <Badge label={ofi.openFinance.enabled ? "Ligado" : "Desligado"} tone={ofi.openFinance.enabled ? "positive" : "default"} /> : undefined}
                />
                <Divider inset={48} />
                <ListRow
                  title="Avisos no celular"
                  subtitle={ofi ? `${ofi.push.registeredTokens} aparelho(s) registrado(s)` : undefined}
                  left={<IconBadge icon="bell" color="#EF4444" size={36} />}
                />
              </>
            )}
          </Card>
        </Section>
      </Reveal>

      <Reveal index={4}>
        <Card style={{ paddingVertical: 6 }}>
          <ShortcutRow icon="users" title="Usuários" subtitle="Nomes, e-mails, planos e situação das contas" onPress={() => go("/admin/users")} color={colors.accent} />
          <Divider inset={52} />
          <ShortcutRow icon="lightbulb" title="Quadro de sugestões" subtitle={pendingSuggestions === null ? "Ideias enviadas pelos usuários" : pendingSuggestions === 0 ? "Nenhuma esperando análise" : `${pendingSuggestions} esperando análise`} onPress={() => go("/admin/suggestions")} color="#F59E0B" />
          <Divider inset={52} />
          <ShortcutRow icon="list-checks" title="Atividade dos administradores" subtitle="Quem fez o quê, em qual conta e quando" onPress={() => go("/admin/activity")} color="#14B8A6" />
          <Divider inset={52} />
          <ShortcutRow icon="file-text" title="Diagnóstico do app" subtitle="Erros e respostas da API deste aparelho" onPress={() => go("/settings/diagnostics")} color="#64748B" />
        </Card>
      </Reveal>
    </Screen>
  );
}

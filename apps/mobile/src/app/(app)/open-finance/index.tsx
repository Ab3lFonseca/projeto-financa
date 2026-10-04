import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { UpsellCard } from "@/components/feature/Common";
import { PluggyWidget } from "@/components/feature/PluggyWidget";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Badge } from "@/components/ui/Controls";
import { Banner, EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Divider, IconBadge, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { OptionSheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { errorText } from "@/components/ui/ApiErrorMessage";
import { api, type BankConnection } from "@/lib/api/endpoints";
import { useMe } from "@/lib/auth/AuthProvider";
import { formatDateShort } from "@/lib/format";
import { useAccounts, useApiMutation, useBankConnections, useCards, useOpenFinanceStatus } from "@/lib/hooks";
import { confirmDialog, toast } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";

const STATUS: Record<BankConnection["status"], { label: string; tone: "positive" | "warning" | "negative" | "default" }> = {
  ACTIVE: { label: "Ativa", tone: "positive" },
  CONNECTING: { label: "Conectando", tone: "warning" },
  OUTDATED: { label: "Desatualizada", tone: "warning" },
  ERROR: { label: "Precisa de atenção", tone: "negative" },
  REVOKED: { label: "Revogada", tone: "default" },
};

type Widget = { token: string; connectorIds: number[]; updateItem: string | null };

export default function OpenFinanceScreen() {
  const { colors } = useTheme();
  const me = useMe();
  const status = useOpenFinanceStatus();
  const connections = useBankConnections();
  const accounts = useAccounts();
  const cards = useCards();
  const [accepted, setAccepted] = useState(false);
  const [widget, setWidget] = useState<Widget | null>(null);
  const [opening, setOpening] = useState(false);
  const [linking, setLinking] = useState<{ connection: BankConnection; providerAccountId: string; kind: "BANK" | "CREDIT" } | null>(null);

  const grant = useApiMutation(() => api.privacy.setConsent("OPEN_FINANCE", me.legalVersions.privacy, true), { success: "Autorização registrada" });
  const register = useApiMutation((itemId: string) => api.openFinance.register(itemId), { success: "Banco conectado! Agora vincule as contas." });
  const sync = useApiMutation((id: string) => api.openFinance.sync(id), {});
  const link = useApiMutation(
    async (v: { connectionId: string; providerAccountId: string; accountId?: string | null; cardId?: string | null }) => {
      await api.openFinance.link(v.connectionId, v.providerAccountId, { accountId: v.accountId ?? null, cardId: v.cardId ?? null });
      // Já traz as transações da conta recém-vinculada.
      return api.openFinance.sync(v.connectionId);
    },
    { success: "Conta vinculada" },
  );
  const remove = useApiMutation((id: string) => api.openFinance.remove(id), { success: "Conexão encerrada" });
  const revokeConsent = useApiMutation(() => api.privacy.setConsent("OPEN_FINANCE", me.legalVersions.privacy, false), { success: "Autorização retirada e conexões encerradas" });

  /** Busca a lista de bancos regulados + token; se algo falhar, NÃO abre o widget (nunca listar bancos por senha). */
  const openWidget = async (connection?: BankConnection) => {
    setOpening(true);
    try {
      const [{ data }, token] = await Promise.all([api.openFinance.connectors(), api.openFinance.connectToken(connection?.id)]);
      if (data.length === 0) {
        toast.error("Não foi possível carregar a lista de bancos do Open Finance. Tente novamente em instantes.");
        return;
      }
      setWidget({ token: token.accessToken, connectorIds: data.map((c) => c.id), updateItem: token.itemId });
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setOpening(false);
    }
  };

  const loading = status.isLoading || (status.data?.consentGranted && connections.isLoading);
  const list = connections.data?.data ?? [];

  const linkOptions = linking
    ? linking.kind === "BANK"
      ? (accounts.data?.data ?? []).map((a) => ({ value: `acc:${a.id}`, label: a.name, icon: a.icon ?? undefined, color: a.color }))
      : (cards.data?.data ?? []).map((c) => ({ value: `card:${c.id}`, label: c.name, icon: "credit-card", color: c.color }))
    : [];

  return (
    <Screen
      refreshing={status.isRefetching}
      onRefresh={() => {
        void status.refetch();
        void connections.refetch();
      }}
      header={<ScreenHeader title="Open Finance" />}
    >
      {loading ? (
        <SkeletonCard lines={4} />
      ) : status.isError ? (
        <ErrorState error={status.error} onRetry={() => void status.refetch()} />
      ) : !status.data?.enabled ? (
        <Card>
          <EmptyState icon="link" title="Em breve" message="A conexão automática com bancos ainda não está ligada neste ambiente. Enquanto isso, você pode lançar tudo manualmente." />
        </Card>
      ) : !status.data.allowedByPlan ? (
        <UpsellCard text="Conecte seus bancos pelo Open Finance e importe as transações automaticamente." />
      ) : !status.data.consentGranted ? (
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <IconBadge icon="shield-check" color={colors.primary} size={44} />
            <Text variant="heading" style={{ flex: 1 }}>
              Conecte seus bancos com segurança
            </Text>
          </View>
          <Text tone="muted">
            O Open Finance é o sistema oficial do Banco Central: você autoriza no app do seu próprio banco e escolhe o que compartilhar. Nós não pedimos nem guardamos a senha do banco.
          </Text>
          <Text tone="muted" variant="bodySm">
            Trazemos contas e transações dos últimos 90 dias para você revisar antes de virarem lançamentos. Você pode encerrar a conexão a qualquer momento.
          </Text>
          <Checkbox checked={accepted} onChange={setAccepted}>
            <Text variant="bodySm" tone="muted">
              Autorizo o compartilhamento dos meus dados bancários via Open Finance, conforme a{" "}
              <Text variant="bodySm" tone="primary" weight="600" onPress={() => router.push("/legal/privacy")}>
                Política de Privacidade
              </Text>
              .
            </Text>
          </Checkbox>
          <Button label="Autorizar e continuar" size="lg" disabled={!accepted} loading={grant.isPending} onPress={() => grant.mutate(undefined)} />
        </Card>
      ) : (
        <>
          <Button label="Conectar um banco" icon="plus" size="lg" loading={opening} onPress={() => void openWidget()} />

          {connections.isError ? (
            <ErrorState error={connections.error} onRetry={() => void connections.refetch()} />
          ) : list.length === 0 ? (
            <Card>
              <EmptyState icon="landmark" title="Nenhum banco conectado" message="Conecte um banco para importar transações automaticamente e acompanhar tudo em um só lugar." />
            </Card>
          ) : (
            list.map((c) => {
              const st = STATUS[c.status];
              return (
                <Section key={c.id} title={c.institutionName}>
                  <Card style={{ gap: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Badge label={st.label} tone={st.tone} />
                      <Text variant="caption" tone="muted">
                        {c.lastSyncAt ? `Atualizada em ${formatDateShort(c.lastSyncAt.slice(0, 10))}` : "Ainda não sincronizada"}
                      </Text>
                    </View>
                    {c.status === "ERROR" || c.status === "OUTDATED" ? (
                      <Banner tone="warning" icon="triangle-alert">
                        Não conseguimos atualizar os dados deste banco. Reconecte para renovar a autorização.
                      </Banner>
                    ) : null}

                    {c.accounts.length === 0 ? (
                      <Text variant="bodySm" tone="muted">
                        Nenhuma conta encontrada ainda. Se acabou de conectar, toque em Atualizar.
                      </Text>
                    ) : (
                      c.accounts.map((a, i) => {
                        const target = a.account ?? a.card;
                        return (
                          <View key={a.providerAccountId}>
                            {i > 0 ? <Divider /> : null}
                            <View style={{ paddingVertical: 10, gap: 6 }}>
                              <Text weight="600">
                                {a.name} · {a.kind === "CREDIT" ? "Cartão" : "Conta"}
                              </Text>
                              <Button
                                label={target ? `Vinculada a ${target.name}` : a.kind === "CREDIT" ? "Vincular a um cartão do app" : "Vincular a uma conta do app"}
                                variant={target ? "secondary" : "primary"}
                                size="sm"
                                fullWidth={false}
                                onPress={() => setLinking({ connection: c, providerAccountId: a.providerAccountId, kind: a.kind })}
                              />
                            </View>
                          </View>
                        );
                      })
                    )}

                    <View style={{ gap: 8 }}>
                      {c.pendingCount > 0 ? (
                        <Button label={`Revisar ${c.pendingCount} ${c.pendingCount === 1 ? "transação" : "transações"}`} icon="list-checks" onPress={() => router.push("/open-finance/review" as never)} />
                      ) : null}
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Button label="Atualizar" icon="refresh-cw" variant="secondary" size="sm" loading={sync.isPending && sync.variables === c.id} onPress={() => sync.mutate(c.id, { onSuccess: (r) => toast.success(r.newTransactions > 0 ? `${r.newTransactions} nova(s) transação(ões)` : "Tudo em dia") })} />
                        </View>
                        {c.status !== "ACTIVE" ? (
                          <View style={{ flex: 1 }}>
                            <Button label="Reconectar" variant="secondary" size="sm" loading={opening} onPress={() => void openWidget(c)} />
                          </View>
                        ) : null}
                      </View>
                      <Button
                        label="Remover conexão"
                        variant="ghost"
                        size="sm"
                        loading={remove.isPending && remove.variables === c.id}
                        onPress={async () => {
                          if (await confirmDialog({ title: `Remover ${c.institutionName}?`, message: "Encerramos o acesso no Open Finance. Os lançamentos já importados continuam no app.", confirmLabel: "Remover", destructive: true })) remove.mutate(c.id);
                        }}
                      />
                    </View>
                  </Card>
                </Section>
              );
            })
          )}

          <Button
            label="Retirar autorização do Open Finance"
            variant="ghost"
            size="sm"
            onPress={async () => {
              if (await confirmDialog({ title: "Retirar a autorização?", message: "Todas as conexões com bancos serão encerradas. Os lançamentos já importados continuam no app.", confirmLabel: "Retirar", destructive: true })) revokeConsent.mutate(undefined);
            }}
          />
          <Text variant="caption" tone="faint" align="center">
            Nunca pedimos a senha do seu banco. A autorização acontece no ambiente oficial do banco.
          </Text>
        </>
      )}

      <PluggyWidget
        visible={widget !== null}
        connectToken={widget?.token ?? ""}
        connectorIds={widget?.connectorIds ?? []}
        updateItem={widget?.updateItem}
        onSuccess={(itemId) => {
          setWidget(null);
          register.mutate(itemId);
        }}
        onClose={() => setWidget(null)}
        onError={(message) => {
          setWidget(null);
          toast.error(message || "Não foi possível conectar o banco.");
        }}
      />

      <OptionSheet
        visible={linking !== null}
        title={linking?.kind === "CREDIT" ? "Vincular ao cartão" : "Vincular à conta"}
        options={linkOptions}
        empty={linking?.kind === "CREDIT" ? "Cadastre o cartão na aba Carteira primeiro." : "Cadastre a conta na aba Carteira primeiro."}
        onSelect={(v) => {
          if (!linking) return;
          const id = v.slice(v.indexOf(":") + 1);
          link.mutate({ connectionId: linking.connection.id, providerAccountId: linking.providerAccountId, ...(v.startsWith("card:") ? { cardId: id } : { accountId: id }) });
        }}
        onClose={() => setLinking(null)}
        footer={
          linking ? (
            <View style={{ paddingTop: 8 }}>
              <Button
                label="Desvincular"
                variant="ghost"
                onPress={() => {
                  link.mutate({ connectionId: linking.connection.id, providerAccountId: linking.providerAccountId });
                  setLinking(null);
                }}
              />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

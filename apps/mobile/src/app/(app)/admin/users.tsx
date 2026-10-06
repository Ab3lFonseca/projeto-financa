import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { AdminGate } from "@/components/AdminGate";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/Button";
import { Badge, Chip, SwitchRow } from "@/components/ui/Controls";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { TextField } from "@/components/ui/Inputs";
import { Card, Divider, ListRow, Screen, ScreenHeader } from "@/components/ui/Layout";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { ACCESS_STATE_LABEL, dateText, GRANT_DURATIONS } from "@/lib/access";
import { api, type AdminUser, type AdminUserDetail } from "@/lib/api/endpoints";
import { userInitial, userLabel } from "@/lib/admin";
import { formatAgo } from "@/lib/format";
import { useAdminUser, useAdminUsers, useApiMutation } from "@/lib/hooks";
import { confirmDialog } from "@/lib/ui-store";
import { THEME_META } from "@/theme/presets";
import { useTheme } from "@/theme/ThemeProvider";

/** Lista de usuários (nome, e-mail, plano, situação). Só metadados de conta: nada financeiro nem bancário. */
export default function AdminUsersScreen() {
  return (
    <AdminGate>
      <UsersList />
    </AdminGate>
  );
}

/** Espera a pessoa parar de digitar antes de buscar no servidor. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function UsersList() {
  const { colors } = useTheme();
  const [text, setText] = useState("");
  const search = useDebounced(text.trim(), 300);
  const query = useAdminUsers(search);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const users = query.data?.pages.flatMap((p) => p.data) ?? [];
  const header = <ScreenHeader title="Usuários" subtitle="Só dados de cadastro, nada financeiro" />;

  return (
    <Screen header={header} refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()}>
      <TextField
        value={text}
        onChangeText={setText}
        placeholder="Buscar por nome ou e-mail"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        left={<Icon name="search" size={18} color={colors.textMuted} />}
        right={
          text ? (
            <Pressable onPress={() => setText("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Limpar busca">
              <Icon name="x" size={18} color={colors.textMuted} />
            </Pressable>
          ) : undefined
        }
      />

      {query.isLoading && !query.data ? (
        <SkeletonCard lines={4} />
      ) : query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : users.length === 0 ? (
        <Card>
          <EmptyState icon="users" title={search ? "Ninguém encontrado" : "Nenhum usuário ainda"} message={search ? "Tente outro nome ou e-mail." : undefined} />
        </Card>
      ) : (
        <>
          <Card style={{ paddingVertical: 6 }}>
            {users.map((u, i) => (
              <View key={u.id}>
                {i > 0 ? <Divider inset={52} /> : null}
                <UserRow user={u} onPress={() => setSelectedId(u.id)} />
              </View>
            ))}
          </Card>
          {query.hasNextPage ? <Button label="Carregar mais" variant="secondary" loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}
        </>
      )}

      <UserSheet id={selectedId} onClose={() => setSelectedId(null)} />
    </Screen>
  );
}

function UserRow({ user, onPress }: { user: AdminUser; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <ListRow
      title={userLabel(user.displayName, user.email)}
      subtitle={user.email}
      onPress={onPress}
      left={
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
          <Text weight="700" tone="primary">
            {userInitial(user.displayName, user.email)}
          </Text>
        </View>
      }
      right={
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {user.role === "ADMIN" ? <Badge label="Admin" tone="primary" /> : null}
            {user.status !== "ACTIVE" ? <Badge label={user.status === "SUSPENDED" ? "Suspenso" : "Excluindo"} tone="negative" /> : null}
            {user.access.state === "paid" ? <Badge label="Assinante" tone="positive" /> : null}
            {user.access.state === "complimentary" ? <Badge label="Cortesia" tone="positive" /> : null}
            {user.access.state === "trial" ? <Badge label="Teste" tone="primary" /> : null}
            {user.access.state === "expired" ? <Badge label="Vencido" tone="warning" /> : null}
          </View>
          <Text variant="caption" tone="faint">
            {formatAgo(user.lastSeenAt)}
          </Text>
        </View>
      }
    />
  );
}

const STATUS_LABEL = { ACTIVE: "Ativa", SUSPENDED: "Suspensa", DELETING: "Em exclusão" } as const;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="caption" tone="muted" weight="600">
        {label}
      </Text>
      <Text selectable>{value}</Text>
    </View>
  );
}

/** Detalhe de um usuário. Os mesmos dados da lista mais o tema escolhido e o acesso; nada financeiro. */
function UserSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useAdminUser(id);
  const u = detail.data;
  const theme = u?.themePreset ? THEME_META.find((m) => m.id === u.themePreset) : null;
  const [granting, setGranting] = useState(false);
  const revoke = useApiMutation((userId: string) => api.admin.revokeAccess(userId), { success: "Acesso gratuito removido" });

  const askRevoke = async () => {
    if (!u) return;
    const ok = await confirmDialog({
      title: "Remover o acesso gratuito?",
      message: "A pessoa volta à situação normal: se o teste grátis já acabou, o app fica somente leitura para ela.",
      confirmLabel: "Remover",
      destructive: true,
    });
    if (ok) revoke.mutate(u.id);
  };

  return (
    <>
      <Sheet visible={id !== null && !granting} onClose={onClose} title={u ? userLabel(u.displayName, u.email) : "Usuário"}>
        {detail.isLoading ? (
          <SkeletonCard lines={4} />
        ) : detail.isError || !u ? (
          <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
        ) : (
          <View style={{ gap: 14, paddingBottom: 8 }}>
            <Field label="Nome" value={u.displayName ?? "Não informado"} />
            <Field label="E-mail" value={u.email} />
            <Field label="Situação da conta" value={STATUS_LABEL[u.status]} />
            <Field label="Papel" value={u.role === "ADMIN" ? "Administrador" : "Usuário"} />
            <Field
              label="Acesso (com a cobrança ligada)"
              value={`${ACCESS_STATE_LABEL[u.access.state]}${u.access.expiresAt ? ` · até ${dateText(u.access.expiresAt)}` : ""}${u.access.investments ? " · com Rendimentos" : ""}`}
            />
            <Field label="Cadastro" value={new Date(u.createdAt).toLocaleString("pt-BR")} />
            <Field label="Último acesso" value={u.lastSeenAt ? `${new Date(u.lastSeenAt).toLocaleString("pt-BR")} (${formatAgo(u.lastSeenAt)})` : "Nunca"} />
            <Field label="Tutorial de primeiro uso" value={u.onboardingCompleted ? "Concluído" : "Ainda não concluiu"} />
            <Field label="Tema" value={theme ? `${theme.emoji} ${theme.label}` : "—"} />
            <Field label="ID" value={u.id} />
            {u.role === "USER" && u.status === "ACTIVE" ? (
              <View style={{ gap: 8 }}>
                <Button label={u.access.state === "complimentary" ? "Alterar acesso gratuito" : "Conceder acesso gratuito"} icon="gift" variant="secondary" onPress={() => setGranting(true)} />
                {u.access.state === "complimentary" ? <Button label="Remover acesso gratuito" variant="danger" loading={revoke.isPending} onPress={() => void askRevoke()} /> : null}
              </View>
            ) : null}
          </View>
        )}
      </Sheet>
      <GrantSheet user={granting ? u : undefined} onClose={() => setGranting(false)} />
    </>
  );
}

/** Escolha da duração (e do Rendimentos) para uma cortesia. Não mexe em quem já tem assinatura paga: o servidor recusa. */
function GrantSheet({ user, onClose }: { user: AdminUserDetail | undefined; onClose: () => void }) {
  const [days, setDays] = useState<number | null>(30);
  const [investments, setInvestments] = useState(false);
  const grant = useApiMutation((v: { id: string; days: number | null; investments: boolean }) => api.admin.grantAccess(v.id, { days: v.days, investments: v.investments }), {
    success: "Acesso gratuito concedido",
    onSuccess: onClose,
  });
  return (
    <Sheet visible={!!user} onClose={onClose} title="Acesso gratuito">
      {user ? (
        <View style={{ gap: 16, paddingBottom: 8 }}>
          <Text tone="muted">
            {userLabel(user.displayName, user.email)} poderá usar o app sem pagar. Vale também com a cobrança ligada e não entra na receita.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {GRANT_DURATIONS.map((d) => (
              <Chip key={d.label} label={d.label} selected={days === d.days} onPress={() => setDays(d.days)} />
            ))}
          </View>
          <SwitchRow title="Incluir Rendimentos" subtitle="CDI, CDB e porquinho (plano a mais)" value={investments} onChange={setInvestments} />
          <View style={{ gap: 8 }}>
            <Button label="Conceder" loading={grant.isPending} onPress={() => grant.mutate({ id: user.id, days, investments })} />
            <Button label="Cancelar" variant="ghost" onPress={onClose} />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

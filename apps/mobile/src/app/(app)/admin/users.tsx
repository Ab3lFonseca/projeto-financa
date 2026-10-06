import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { AdminGate } from "@/components/AdminGate";
import { UserSheet } from "@/components/admin/UserSheet";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Controls";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { TextField } from "@/components/ui/Inputs";
import { Card, Divider, ListRow, Screen, ScreenHeader } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import type { AdminUser } from "@/lib/api/endpoints";
import { userInitial, userLabel } from "@/lib/admin";
import { formatAgo } from "@/lib/format";
import { useAdminUsers } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeProvider";

/** Lista de usuários (nome, e-mail, situação). Só metadados de conta: nada financeiro nem bancário. */
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
  const header = <ScreenHeader title="Usuários" subtitle="Só dados de cadastro, nada financeiro" backTo="/admin" />;

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
            {user.mfaEnabled ? <Badge label="2FA" tone="positive" /> : null}
          </View>
          <Text variant="caption" tone="faint">
            {formatAgo(user.lastSeenAt)}
          </Text>
        </View>
      }
    />
  );
}

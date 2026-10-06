import { router } from "expo-router";
import { View } from "react-native";
import { ShortcutRow } from "@/components/feature/Common";
import { TourTarget } from "@/components/tour/TourTarget";
import { Badge } from "@/components/ui/Controls";
import { Card, Divider, Screen } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUnreadCount } from "@/lib/hooks";
import { useOutbox } from "@/lib/offline/outbox";
import { useTourStore } from "@/lib/tour/store";
import { confirmDialog } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";

const go = (p: string) => router.push(p as never);

export default function MoreScreen() {
  const { colors } = useTheme();
  const { me, signOut } = useAuth();
  const unread = useUnreadCount().data?.count ?? 0;
  const pending = useOutbox((s) => s.items.length);
  const name = me?.profile.displayName || me?.email.split("@")[0] || "Você";

  return (
    <Screen tabs header={<View style={{ paddingHorizontal: 16, paddingTop: 8 }}><Text variant="title">Mais</Text></View>}>
      <Card onPress={() => go("/settings")} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
          <Text variant="heading" tone="primary">
            {name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text weight="700" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {me?.email}
          </Text>
        </View>
        {me?.entitlements.plan === "PREMIUM" ? <Badge label={me.entitlements.billingEnforced ? "Premium" : "Beta Premium"} tone="primary" /> : <Badge label="Gratuito" />}
      </Card>

      <TourTarget id="more-planning">
        <Card style={{ paddingVertical: 6 }}>
          <ShortcutRow icon="target" title="Orçamentos" subtitle="Limite por categoria no mês" onPress={() => go("/budgets")} color="#F59E0B" />
          <Divider inset={52} />
          <ShortcutRow icon="trophy" title="Metas" subtitle="Acompanhe seus objetivos" onPress={() => go("/goals")} color="#22C55E" />
          <Divider inset={52} />
          <ShortcutRow icon="repeat" title="Recorrências" subtitle="Contas e receitas que se repetem" onPress={() => go("/recurring")} color="#6366F1" />
          <Divider inset={52} />
          <ShortcutRow icon="tag" title="Categorias" subtitle="Crie e personalize" onPress={() => go("/categories")} color="#EC4899" />
        </Card>
      </TourTarget>

      <TourTarget id="more-bank">
        <Card style={{ paddingVertical: 6 }}>
          <ShortcutRow icon="bell" title="Notificações" subtitle="Vencimentos, orçamentos e metas" onPress={() => go("/notifications")} badge={unread ? <Badge label={String(unread)} tone="negative" /> : undefined} color="#EF4444" />
          {pending > 0 ? (
            <>
              <Divider inset={52} />
              <ShortcutRow icon="cloud-off" title="Pendências de sincronização" subtitle={`${pending} lançamento(s) aguardando envio`} onPress={() => go("/settings/sync")} color="#F59E0B" />
            </>
          ) : null}
          <Divider inset={52} />
          <ShortcutRow icon="link" title="Open Finance" subtitle="Conecte seus bancos" onPress={() => go("/open-finance")} color="#0EA5E9" />
        </Card>
      </TourTarget>

      <Card style={{ paddingVertical: 6 }}>
        <TourTarget id="more-settings">
          <ShortcutRow icon="settings" title="Configurações" subtitle="Perfil, aparência e segurança" onPress={() => go("/settings")} color="#64748B" />
          <Divider inset={52} />
          <ShortcutRow icon="graduation-cap" title="Tutorial do app" subtitle="Reveja o que o Finança faz, passo a passo" onPress={() => useTourStore.getState().start("manual")} color={colors.accent} />
        </TourTarget>
        <Divider inset={52} />
        <ShortcutRow icon="shield-check" title="Privacidade e dados" subtitle="Consentimentos, exportar e excluir" onPress={() => go("/settings/privacy")} color="#14B8A6" />
        <Divider inset={52} />
        <ShortcutRow icon="file-text" title="Termos de Uso" onPress={() => go("/legal/terms")} color="#94A3B8" />
        <Divider inset={52} />
        <ShortcutRow icon="file-text" title="Política de Privacidade" onPress={() => go("/legal/privacy")} color="#94A3B8" />
      </Card>

      <Card style={{ paddingVertical: 6 }}>
        <ShortcutRow
          icon="log-out"
          title="Sair"
          color="#EF4444"
          onPress={async () => {
            if (await confirmDialog({ title: "Sair da conta?", message: "Seus dados continuam salvos. Você pode entrar de novo quando quiser.", confirmLabel: "Sair" })) await signOut();
          }}
        />
      </Card>
      <Text variant="caption" tone="faint" align="center">
        Finança · versão 0.1.0
      </Text>
    </Screen>
  );
}

import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { ShortcutRow } from "@/components/feature/Common";
import { Button } from "@/components/ui/Button";
import { Segmented, SwitchRow } from "@/components/ui/Controls";
import { TextField } from "@/components/ui/Inputs";
import { Card, Divider, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { api } from "@/lib/api/endpoints";
import { useAuth, useMe } from "@/lib/auth/AuthProvider";
import { useApiMutation } from "@/lib/hooks";
import { biometricsAvailable, useLockSettings } from "@/lib/lock";
import { registerForPush } from "@/lib/push";
import { toast } from "@/lib/ui-store";
import { useThemeStore, type ThemeMode } from "@/theme/ThemeProvider";

const go = (p: string) => router.push(p as never);

const PREFS: { key: "billsDue" | "invoicesDue" | "budgets" | "goals"; title: string; subtitle: string }[] = [
  { key: "billsDue", title: "Contas a vencer", subtitle: "Lembrete de despesas e recorrências" },
  { key: "invoicesDue", title: "Faturas de cartão", subtitle: "Aviso antes do vencimento" },
  { key: "budgets", title: "Orçamentos", subtitle: "Quando chegar perto do limite ou estourar" },
  { key: "goals", title: "Metas", subtitle: "Marcos de progresso e conquistas" },
];

export default function SettingsScreen() {
  const me = useMe();
  const { refreshMe } = useAuth();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const lock = useLockSettings();
  const [bioAvailable, setBioAvailable] = useState(false);
  const [name, setName] = useState(me.profile.displayName ?? "");

  useEffect(() => {
    void biometricsAvailable().then(setBioAvailable);
  }, []);

  const update = useApiMutation((body: Parameters<typeof api.me.update>[0]) => api.me.update(body), {
    silent: true,
    onSuccess: () => void refreshMe(),
  });
  const saveName = useApiMutation(() => api.me.update({ displayName: name.trim() || null }), {
    success: "Nome atualizado",
    onSuccess: () => void refreshMe(),
  });

  const changeTheme = (m: ThemeMode) => {
    setMode(m);
    update.mutate({ theme: m === "dark" ? "DARK" : m === "light" ? "LIGHT" : "SYSTEM" });
  };

  const prefs = me.profile.notificationPrefs;
  const nameChanged = name.trim() !== (me.profile.displayName ?? "");

  return (
    <Screen header={<ScreenHeader title="Configurações" />}>
      <Section title="Perfil">
        <Card style={{ gap: 12 }}>
          <TextField label="Como quer ser chamado" value={name} onChangeText={setName} placeholder="Seu nome" maxLength={100} autoCapitalize="words" />
          <View style={{ gap: 2 }}>
            <Text variant="caption" tone="muted" weight="600">
              E-mail
            </Text>
            <Text>{me.email}</Text>
          </View>
          {nameChanged ? <Button label="Salvar nome" size="sm" loading={saveName.isPending} onPress={() => saveName.mutate(undefined)} /> : null}
        </Card>
      </Section>

      <Section title="Aparência">
        <Segmented<ThemeMode> options={[{ value: "system", label: "Sistema" }, { value: "light", label: "Claro" }, { value: "dark", label: "Escuro" }]} value={mode} onChange={changeTheme} />
      </Section>

      <Section title="Notificações">
        <Card style={{ paddingVertical: 4 }}>
          {PREFS.map((p, i) => (
            <View key={p.key}>
              {i > 0 ? <Divider /> : null}
              <SwitchRow title={p.title} subtitle={p.subtitle} value={prefs[p.key]} onChange={(v) => update.mutate({ notificationPrefs: { [p.key]: v } })} />
            </View>
          ))}
        </Card>
        <Button label="Ativar notificações neste aparelho" variant="secondary" onPress={async () => { await registerForPush(); toast.info("Se o sistema pediu permissão e você aceitou, está tudo pronto."); }} />
      </Section>

      <Section title="Segurança">
        <Card style={{ paddingVertical: 4 }}>
          <SwitchRow
            title="Bloqueio por biometria"
            subtitle={bioAvailable ? "Peça digital, rosto ou senha do aparelho ao abrir o app" : "Disponível apenas em aparelhos com biometria cadastrada"}
            value={lock.enabled}
            disabled={!bioAvailable}
            onChange={(v) => void lock.setEnabled(v)}
          />
          <Divider />
          <ShortcutRow icon="key-round" title="Alterar senha" onPress={() => go("/settings/password")} color="#6366F1" />
        </Card>
      </Section>

      <Section title="Dados e privacidade">
        <Card style={{ paddingVertical: 4 }}>
          <ShortcutRow icon="shield-check" title="Privacidade e dados" subtitle="Consentimentos, exportar e excluir conta" onPress={() => go("/settings/privacy")} color="#14B8A6" />
          <Divider inset={52} />
          <ShortcutRow icon="refresh-cw" title="Sincronização" subtitle="Lançamentos feitos sem internet" onPress={() => go("/settings/sync")} color="#F59E0B" />
          <Divider inset={52} />
          <ShortcutRow icon="file-text" title="Diagnóstico" subtitle="Registro de erros do app" onPress={() => go("/settings/diagnostics")} color="#64748B" />
        </Card>
      </Section>
    </Screen>
  );
}

import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { HeroBanner } from "@/components/art/HeroBanner";
import { ShortcutRow } from "@/components/feature/Common";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Controls";
import { ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { TextField } from "@/components/ui/Inputs";
import { Card, Divider, Reveal, Row, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { dateBR, dateTimeBR, limitText, memberSince, providerLabel } from "@/lib/account";
import { api } from "@/lib/api/endpoints";
import { useAuth, useMe } from "@/lib/auth/AuthProvider";
import { useApiMutation } from "@/lib/hooks";
import { toast } from "@/lib/ui-store";
import { useTheme } from "@/theme/ThemeProvider";

const go = (p: string) => router.push(p as never);

function InfoRow({ label, value, right }: { label: string; value: string; right?: ReactNode }) {
  return (
    <Row style={{ paddingVertical: 11, justifyContent: "space-between", alignItems: "flex-start" }} gap={12}>
      <Text variant="bodySm" tone="muted" style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        <Text variant="bodySm" weight="600" align="right" selectable>
          {value}
        </Text>
        {right}
      </View>
    </Row>
  );
}

/** Minha conta: dados de cadastro e as trocas de nome, e-mail e senha, com o limite de cada uma por mês e por ano. */
export default function AccountScreen() {
  const me = useMe();
  const { refreshMe } = useAuth();
  const { colors } = useTheme();
  const account = useQuery({ queryKey: ["account"], queryFn: api.me.account });
  const a = account.data;

  const [name, setName] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const draftName = name ?? a?.displayName ?? "";
  const nameChanged = a ? draftName.trim() !== (a.displayName ?? "") : false;

  const saveName = useApiMutation(() => api.me.update({ displayName: draftName.trim() || null }), {
    success: "Nome atualizado",
    onSuccess: () => {
      setName(null);
      void refreshMe();
    },
  });
  const changeEmail = useApiMutation(() => api.me.changeEmail(newEmail.trim(), emailPassword), {
    onSuccess: (res) => {
      setPending(res.pendingEmail);
      setEmailOpen(false);
      setNewEmail("");
      setEmailPassword("");
    },
  });
  const resetLink = useApiMutation(() => api.me.resetLink(), { success: "Enviamos o link de redefinição para o seu e-mail." });

  const header = <ScreenHeader title="Minha conta" backTo="/settings" />;
  if (account.isLoading && !a) {
    return (
      <Screen header={header}>
        <SkeletonCard lines={4} />
        <SkeletonCard />
      </Screen>
    );
  }
  if (!a) {
    return (
      <Screen header={header}>
        <ErrorState error={account.error} onRetry={() => void account.refetch()} />
      </Screen>
    );
  }

  const sec = a.security;
  const displayName = a.displayName || a.email.split("@")[0] || "Você";

  return (
    <Screen header={header} refreshing={account.isRefetching} onRefresh={() => void account.refetch()}>
      <HeroBanner tone="primary" icon="user" title={displayName} subtitle={`${a.email} · ${memberSince(a.createdAt)}`} compact />

      <Reveal index={1}>
        <Section title="Dados do cadastro">
          <Card style={{ paddingVertical: 4 }}>
            <InfoRow label="Nome" value={a.displayName ?? "Não informado"} />
            <Divider />
            <InfoRow label="E-mail" value={a.email} />
            <Divider />
            <InfoRow label="Conta criada em" value={dateTimeBR(a.createdAt)} />
            <Divider />
            <InfoRow label="Último acesso" value={a.lastSeenAt ? dateTimeBR(a.lastSeenAt) : "Agora"} />
            <Divider />
            <InfoRow label="Entra com" value={sec.providers.map(providerLabel).join(", ")} />
            <Divider />
            <InfoRow label="Verificação em duas etapas" value={sec.mfa.enabled ? "Ligada" : "Desligada"} right={sec.mfa.enabledAt ? <Text variant="caption" tone="faint">desde {dateBR(sec.mfa.enabledAt)}</Text> : undefined} />
            <Divider />
            <InfoRow label="Fuso horário" value={a.timezone} />
            <Divider />
            <InfoRow label="Moeda e idioma" value={`${a.currency} · ${a.locale}`} />
            <Divider />
            <InfoRow label="Termos de Uso" value={a.legal.termsVersion ? `Versão ${a.legal.termsVersion}` : "Não aceito"} right={a.legal.termsAcceptedAt ? <Text variant="caption" tone="faint">aceito em {dateBR(a.legal.termsAcceptedAt)}</Text> : undefined} />
            <Divider />
            <InfoRow label="Política de Privacidade" value={a.legal.privacyVersion ? `Versão ${a.legal.privacyVersion}` : "Não aceita"} right={a.legal.privacyAcceptedAt ? <Text variant="caption" tone="faint">aceita em {dateBR(a.legal.privacyAcceptedAt)}</Text> : undefined} />
            <Divider />
            <InfoRow label="Novidades por e-mail" value={a.legal.marketingOptIn ? "Aceito" : "Não"} />
            <Divider />
            <InfoRow label="Código da conta" value={a.id} />
          </Card>
        </Section>
      </Reveal>

      <Reveal index={2}>
        <Section title="O que você já registrou">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {[
              { label: "Lançamentos", value: a.summary.transactions },
              { label: "Contas", value: a.summary.accounts },
              { label: "Cartões", value: a.summary.cards },
              { label: "Metas", value: a.summary.goals },
            ].map((s) => (
              <Card key={s.label} style={{ flexGrow: 1, flexBasis: 120, alignItems: "center", gap: 2, paddingVertical: 14 }}>
                <Text variant="title" weight="700" tabular>
                  {s.value.toLocaleString("pt-BR")}
                </Text>
                <Text variant="caption" tone="muted">
                  {s.label}
                </Text>
              </Card>
            ))}
          </View>
        </Section>
      </Reveal>

      <Reveal index={3}>
        <Section title="Nome">
          <Card style={{ gap: 10 }}>
            <TextField label="Como você quer ser chamado(a)" value={draftName} onChangeText={setName} maxLength={100} autoCapitalize="words" placeholder="Seu nome" />
            <Text variant="caption" tone={a.limits.NAME.canChange ? "muted" : "negative"}>
              {a.displayName ? limitText(a.limits.NAME) : "A primeira vez que você define o nome não conta nos limites."}
            </Text>
            {nameChanged ? <Button label="Salvar nome" size="sm" loading={saveName.isPending} disabled={!a.limits.NAME.canChange && !!a.displayName} onPress={() => saveName.mutate(undefined)} /> : null}
          </Card>
        </Section>
      </Reveal>

      <Reveal index={4}>
        <Section title="E-mail">
          <Card style={{ gap: 10 }}>
            <Text variant="bodySm" tone="muted">
              O e-mail da conta é <Text variant="bodySm" weight="700">{a.email}</Text>.
            </Text>
            {pending ? (
              <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.positiveSoft }}>
                <Text variant="bodySm">
                  Enviamos um link de confirmação para <Text variant="bodySm" weight="700">{pending}</Text>. O e-mail só muda depois que você abrir esse link (se não chegar, olhe o spam).
                </Text>
              </View>
            ) : null}
            {!sec.canChangeEmail ? (
              <Text variant="caption" tone="muted">
                Você entra com {sec.providers.map(providerLabel).join(", ")}: o e-mail pertence a esse provedor e é alterado lá.
              </Text>
            ) : emailOpen ? (
              <View style={{ gap: 10 }}>
                <TextField label="Novo e-mail" value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="novo@email.com" />
                <TextField label="Sua senha atual" value={emailPassword} onChangeText={setEmailPassword} secure autoCapitalize="none" autoComplete="current-password" />
                <Button label="Enviar link de confirmação" loading={changeEmail.isPending} disabled={!/^\S+@\S+\.\S+$/.test(newEmail.trim()) || !emailPassword} onPress={() => changeEmail.mutate(undefined)} />
                <Button label="Cancelar" variant="ghost" size="sm" onPress={() => setEmailOpen(false)} />
              </View>
            ) : (
              <Button label="Trocar e-mail" variant="secondary" size="sm" disabled={!a.limits.EMAIL.canChange} onPress={() => setEmailOpen(true)} />
            )}
            {sec.canChangeEmail ? (
              <Text variant="caption" tone={a.limits.EMAIL.canChange ? "muted" : "negative"}>
                {limitText(a.limits.EMAIL)}
              </Text>
            ) : null}
          </Card>
        </Section>
      </Reveal>

      <Reveal index={5}>
        <Section title="Senha">
          <Card style={{ paddingVertical: 6 }}>
            <ShortcutRow
              icon="key-round"
              title={sec.hasPassword ? "Alterar senha" : "Definir uma senha"}
              subtitle={sec.hasPassword ? limitText(a.limits.PASSWORD) : "Você entra por Google/Facebook. Defina uma senha para também entrar com e-mail."}
              onPress={() => go("/settings/password")}
              color="#6366F1"
            />
            {sec.hasPassword ? (
              <>
                <Divider inset={52} />
                <ShortcutRow icon="mail" title="Enviar link de redefinição" subtitle="Receba por e-mail um link para criar uma senha nova" onPress={() => resetLink.mutate(undefined)} color="#0EA5E9" />
              </>
            ) : null}
          </Card>
        </Section>
      </Reveal>

      <Reveal index={6}>
        <Card style={{ paddingVertical: 6 }}>
          <ShortcutRow
            icon="shield-check"
            title="Verificação em duas etapas"
            subtitle={sec.mfa.enabled ? "Ligada: sua conta pede um código ao entrar" : "Proteja a conta com um código do celular"}
            badge={<Badge label={sec.mfa.enabled ? "Ligada" : "Desligada"} tone={sec.mfa.enabled ? "positive" : "warning"} />}
            onPress={() => go("/settings/security")}
            color="#14B8A6"
          />
          <Divider inset={52} />
          <ShortcutRow icon="download" title="Privacidade e dados" subtitle="Exportar meus dados, consentimentos e excluir a conta" onPress={() => go("/settings/privacy")} color="#64748B" />
        </Card>
      </Reveal>
      <Text variant="caption" tone="faint" align="center" onPress={() => toast.info("Os limites de troca existem para proteger a sua conta contra abusos e pedidos repetidos.")}>
        Por que existem limites de troca?
      </Text>
    </Screen>
  );
}

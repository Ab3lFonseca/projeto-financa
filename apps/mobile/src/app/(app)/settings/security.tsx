import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { HeroBanner } from "@/components/art/HeroBanner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Controls";
import { TextField } from "@/components/ui/Inputs";
import { Card, Reveal, Row, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { QrCode } from "@/components/ui/QrCode";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { codeDigits, dateBR, providerLabel } from "@/lib/account";
import { api, type MfaEnrollment } from "@/lib/api/endpoints";
import { useAuth, useMe } from "@/lib/auth/AuthProvider";
import { useApiMutation } from "@/lib/hooks";
import { otpauthUri } from "@/lib/otpauth";
import { useTheme } from "@/theme/ThemeProvider";

const STEPS = [
  "Instale um aplicativo autenticador no celular (Google Authenticator, Microsoft Authenticator, Authy, 1Password...).",
  "Abra o aplicativo, toque em adicionar e leia o QR abaixo (ou digite a chave).",
  "Digite aqui o código de 6 números que o aplicativo mostrar.",
];

/** Segurança da conta: ligar e desligar a verificação em duas etapas (aplicativo autenticador) e ver as formas de entrar. */
export default function SecurityScreen() {
  const { adoptSession, refreshMe } = useAuth();
  const me = useMe();
  const { colors, radius } = useTheme();
  const account = useQuery({ queryKey: ["account"], queryFn: api.me.account });
  const sec = account.data?.security;
  const enabled = sec?.mfa.enabled ?? false;

  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const qrUri = enrollment ? otpauthUri({ secret: enrollment.secret, account: me.email }) : null;
  const [code, setCode] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  const start = useApiMutation(() => api.me.mfaEnroll(), { silent: false, onSuccess: (e) => { setEnrollment(e); setCode(""); } });
  const enable = useApiMutation((v: { factorId: string; code: string }) => api.me.mfaEnable(v.factorId, v.code), {
    success: "Verificação em duas etapas ligada!",
    onSuccess: async (session) => {
      // A sessão nova já passou pelo código: ela substitui a de agora, senão a próxima chamada seria recusada.
      await adoptSession(session);
      setEnrollment(null);
      setCode("");
      void account.refetch();
      // Marca a pergunta do primeiro acesso como respondida (quem ligou por aqui não precisa ser perguntado de novo).
      void api.me.securityPromptAnswered().then(() => refreshMe()).catch(() => undefined);
    },
  });
  const disable = useApiMutation((c: string) => api.me.mfaDisable(c), {
    success: "Verificação em duas etapas desligada.",
    onSuccess: () => {
      setDisabling(false);
      setDisableCode("");
      void account.refetch();
      void refreshMe();
    },
  });

  return (
    <Screen header={<ScreenHeader title="Segurança" backTo="/settings/account" />}>
      <HeroBanner
        tone={enabled ? "positive" : "primary"}
        icon="shield-check"
        badge={enabled ? "Ligada" : "Recomendada"}
        title="Verificação em duas etapas"
        subtitle={enabled ? "Para entrar, além da senha, a conta pede um código do seu celular. Obrigado por proteger o seu dinheiro!" : "Mesmo que alguém descubra a sua senha, sem o seu celular não consegue entrar."}
        compact
      />

      {enabled ? (
        <Reveal index={1}>
          <Card style={{ gap: 12 }}>
            <Row gap={10}>
              <Icon name="circle-check" size={22} color={colors.positive} />
              <View style={{ flex: 1 }}>
                <Text weight="600">Sua conta está protegida</Text>
                {sec?.mfa.enabledAt ? (
                  <Text variant="caption" tone="muted">
                    Ligada em {dateBR(sec.mfa.enabledAt)}
                  </Text>
                ) : null}
              </View>
              <Badge label="Ligada" tone="positive" />
            </Row>
            <Text variant="bodySm" tone="muted">
              Perdeu o celular? Fale com o suporte (Mais → Ajuda e suporte): depois de confirmarmos que a conta é sua, desligamos a verificação.
            </Text>
            <Button label="Desligar a verificação" variant="danger" onPress={() => setDisabling(true)} />
          </Card>
        </Reveal>
      ) : enrollment ? (
        <Reveal index={1}>
          <Card style={{ gap: 14 }}>
            {STEPS.map((s, i) => (
              <Row key={s} gap={10} align="flex-start">
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                  <Text variant="caption" weight="700" tone="primary">
                    {i + 1}
                  </Text>
                </View>
                <Text variant="bodySm" tone="muted" style={{ flex: 1 }}>
                  {s}
                </Text>
              </Row>
            ))}
            {qrUri ? (
              <View style={{ alignSelf: "center", padding: 6, borderRadius: radius.md, backgroundColor: "#FFFFFF" }}>
                <QrCode value={qrUri} size={240} label="QR code para cadastrar no aplicativo autenticador" />
              </View>
            ) : (
              <Text variant="bodySm" tone="negative">
                Não foi possível desenhar o QR. Use a chave abaixo no aplicativo autenticador.
              </Text>
            )}
            <View style={{ gap: 4 }}>
              <Text variant="caption" tone="muted" weight="600">
                Não consegue ler o QR? Digite esta chave no aplicativo:
              </Text>
              <Text selectable weight="700" style={{ letterSpacing: 1.5 }}>
                {enrollment.secret.replace(/(.{4})/g, "$1 ").trim()}
              </Text>
              <Text variant="caption" tone="faint">
                Guarde esta chave num lugar seguro: ela recria o código se você trocar de celular.
              </Text>
            </View>
            <TextField
              label="Código de 6 números"
              value={code}
              onChangeText={(v) => setCode(codeDigits(v))}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              autoComplete="one-time-code"
            />
            <Button label="Confirmar e ligar" size="lg" loading={enable.isPending} disabled={code.length !== 6} onPress={() => enable.mutate({ factorId: enrollment.factorId, code })} />
            <Button label="Cancelar" variant="ghost" size="sm" onPress={() => setEnrollment(null)} />
          </Card>
        </Reveal>
      ) : (
        <Reveal index={1}>
          <Card style={{ gap: 12 }}>
            {["Um código novo a cada 30 segundos, só no seu celular.", "Funciona sem internet no aparelho.", "Você pode desligar quando quiser (com um código válido)."].map((t) => (
              <Row key={t} gap={10} align="flex-start">
                <Icon name="circle-check" size={18} color={colors.positive} />
                <Text variant="bodySm" style={{ flex: 1 }}>
                  {t}
                </Text>
              </Row>
            ))}
            <Button label="Ligar a verificação em duas etapas" size="lg" icon="shield-check" loading={start.isPending} onPress={() => start.mutate(undefined)} />
          </Card>
        </Reveal>
      )}

      {sec ? (
        <Reveal index={2}>
          <Section title="Formas de entrar">
            <Card style={{ gap: 10 }}>
              {sec.providers.map((p) => (
                <Row key={p} gap={10}>
                  <Icon name={p === "email" ? "mail" : "key-round"} size={18} color={colors.textMuted} />
                  <Text style={{ flex: 1 }}>{providerLabel(p)}</Text>
                  <Badge label="Ativa" tone="positive" />
                </Row>
              ))}
              <Text variant="caption" tone="faint">
                Quem usa Instagram entra pelo Facebook.
              </Text>
            </Card>
          </Section>
        </Reveal>
      ) : null}

      <Sheet visible={disabling} onClose={() => setDisabling(false)} title="Desligar a verificação">
        <View style={{ gap: 14, paddingBottom: 8 }}>
          <Text tone="muted">Para desligar, digite o código que o aplicativo autenticador mostra agora. Isso confirma que o celular está com você.</Text>
          <TextField label="Código de 6 números" value={disableCode} onChangeText={(v) => setDisableCode(codeDigits(v))} keyboardType="number-pad" inputMode="numeric" maxLength={6} placeholder="000000" autoFocus />
          <Button label="Desligar" variant="dangerSolid" loading={disable.isPending} disabled={disableCode.length !== 6} onPress={() => disable.mutate(disableCode)} />
          <Button label="Cancelar" variant="ghost" onPress={() => setDisabling(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

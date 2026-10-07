import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { HeroBanner } from "@/components/art/HeroBanner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/Button";
import { Row } from "@/components/ui/Layout";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { dateBR } from "@/lib/account";
import { daysText } from "@/lib/access";
import { api } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";
import { BADGE_GATE_TIMEOUT_MS, useBadgeGate } from "@/lib/badgeGate";
import { useCelebrationStore } from "@/lib/celebrate";
import { nextFirstRunStep, type FirstRunStep } from "@/lib/firstRun";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Avisos do primeiro acesso, um de cada vez e uma vez só por conta (o servidor guarda quem já viu, em qualquer aparelho):
 *  1. "Quer ativar a verificação em duas etapas?"
 *  2. "Você está no teste grátis de 30 dias" (só com a cobrança ligada), com o convite a assinar antes do fim, se quiser acesso completo já.
 */
export function FirstRunHost() {
  const { me, refreshMe } = useAuth();
  const { colors } = useTheme();
  const [dismissed, setDismissed] = useState<ReadonlySet<FirstRunStep>>(new Set());
  const [busy, setBusy] = useState(false);
  // A comemoração de boas-vindas (insígnia da conta nova) vem primeiro: espera a conferência das insígnias e a comemoração fechar.
  const badgesChecked = useBadgeGate((s) => s.checked);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), BADGE_GATE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);
  const celebrating = useCelebrationStore((s) => s.current !== null);
  const step = nextFirstRunStep(me, dismissed);
  if (!me || !step || celebrating || !(badgesChecked || waited)) return null;

  const finish = async (which: FirstRunStep, then?: () => void) => {
    setBusy(true);
    setDismissed((prev) => new Set([...prev, which]));
    try {
      await (which === "security" ? api.me.securityPromptAnswered() : api.me.trialIntroSeen());
      await refreshMe();
    } catch {
      /* sem rede: o aviso some agora e volta na próxima vez que o app conseguir falar com o servidor */
    } finally {
      setBusy(false);
    }
    then?.();
  };

  if (step === "security") {
    return (
      <Sheet visible onClose={() => void finish("security")} scroll={false}>
        <View style={{ gap: 16, paddingBottom: 8 }}>
          <HeroBanner compact tone="primary" icon="shield-check" badge="Segurança" title="Proteja a sua conta" subtitle="Ative a verificação em duas etapas: além da senha, um código do seu celular." />
          {["Mesmo que alguém descubra a sua senha, sem o seu celular não entra.", "Leva 1 minuto e funciona com Google Authenticator, Authy e similares.", "Você pode desligar quando quiser."].map((t) => (
            <Row key={t} gap={10} align="flex-start">
              <Icon name="circle-check" size={18} color={colors.positive} />
              <Text variant="bodySm" style={{ flex: 1 }}>
                {t}
              </Text>
            </Row>
          ))}
          <View style={{ gap: 8 }}>
            <Button label="Ativar agora" icon="shield-check" loading={busy} onPress={() => void finish("security", () => router.push("/settings/security" as never))} />
            <Button label="Agora não" variant="ghost" onPress={() => void finish("security")} />
          </View>
          <Text variant="caption" tone="faint" align="center">
            Se mudar de ideia, é só ir em Configurações → Segurança.
          </Text>
        </View>
      </Sheet>
    );
  }

  const access = me.entitlements.access;
  const until = access.expiresAt ? dateBR(access.expiresAt) : null;
  return (
    <Sheet visible onClose={() => void finish("trial")} scroll={false}>
      <View style={{ gap: 16, paddingBottom: 8 }}>
        <HeroBanner
          compact
          rocket
          tone="primary"
          icon="gift"
          badge="Bem-vindo(a)!"
          title="Você ganhou 30 dias grátis"
          subtitle={until ? `Tudo liberado até ${until}${access.daysLeft !== null ? ` (${access.daysLeft === 0 ? "termina hoje" : `faltam ${daysText(access.daysLeft)}`})` : ""}.` : "Tudo liberado durante o teste."}
        />
        <Text tone="muted">
          Sem cartão e sem compromisso. Quando o teste acabar, o app fica somente leitura: você continua vendo e exportando tudo, mas para criar e editar é preciso assinar.
        </Text>
        <View style={{ flexDirection: "row", gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.primarySoft }}>
          <Icon name="crown" size={20} color={colors.primary} />
          <Text variant="bodySm" style={{ flex: 1 }}>
            Quer acesso completo sem esperar? Você já pode assinar agora, antes do fim do teste.
          </Text>
        </View>
        <View style={{ gap: 8 }}>
          <Button label="Ver planos e assinar" icon="crown" loading={busy} onPress={() => void finish("trial", () => router.push("/subscription" as never))} />
          <Button label="Continuar testando" variant="ghost" onPress={() => void finish("trial")} />
        </View>
      </View>
    </Sheet>
  );
}

import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/Button";
import { Card, Screen, ScreenHeader } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useBilling } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeProvider";

/** Quantas leituras de 2 s esperamos o provedor confirmar o pagamento (cartão confirma em segundos; Pix e boleto podem demorar). */
const MAX_TRIES = 20;

/** Para onde o pagamento volta. Confere de verdade (relendo a assinatura) em vez de confiar no endereço, que qualquer um pode digitar. */
export default function SubscriptionReturnScreen() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  const success = status === "success";
  const { refreshMe } = useAuth();
  const { colors } = useTheme();
  const [polling, setPolling] = useState(success);
  const tries = useRef(0);
  const billing = useBilling(polling);
  const paid = billing.data?.access.state === "paid";

  useEffect(() => {
    if (!polling) return;
    tries.current += 1;
    if (paid || tries.current >= MAX_TRIES) setPolling(false);
  }, [billing.dataUpdatedAt, paid, polling]);

  useEffect(() => {
    if (paid) void refreshMe();
  }, [paid, refreshMe]);

  const home = () => router.replace("/" as never);
  const onWeb = Platform.OS === "web" && typeof window !== "undefined";
  // O pagamento abre numa aba separada: ao terminar, a pessoa fecha esta e volta para o app, que continua aberto na aba de origem.
  const closeTab = () => {
    window.close();
    setTimeout(home, 300); // se o navegador não deixar fechar (aba não aberta pelo app), segue para o início
  };

  let body;
  if (!success) {
    body = (
      <Result icon="circle-x" tint={colors.textMuted} title="Pagamento cancelado" message="Nada foi cobrado. Você pode assinar quando quiser.">
        {onWeb ? <Button label="Fechar esta aba" onPress={closeTab} /> : null}
        <Button label="Voltar à assinatura" variant={onWeb ? "ghost" : "primary"} onPress={() => router.replace("/subscription" as never)} />
      </Result>
    );
  } else if (paid) {
    body = (
      <Result icon="circle-check" tint={colors.positive} title="Pagamento confirmado" message="Obrigado! Seu acesso está liberado.">
        {onWeb ? <Button label="Fechar esta aba e voltar ao app" onPress={closeTab} /> : null}
        <Button label="Continuar aqui" variant={onWeb ? "ghost" : "primary"} onPress={home} />
      </Result>
    );
  } else if (polling) {
    body = (
      <Result title="Confirmando seu pagamento…" message="Isso leva só alguns segundos.">
        <ActivityIndicator color={colors.primary} />
      </Result>
    );
  } else {
    body = (
      <Result icon="clock" tint={colors.warning} title="Ainda aguardando a confirmação" message="Alguns meios de pagamento, como o Pix, levam alguns instantes para confirmar. Assim que confirmar, seu acesso é liberado automaticamente.">
        <Button
          label="Verificar de novo"
          onPress={() => {
            tries.current = 0;
            setPolling(true);
          }}
        />
        {onWeb ? <Button label="Fechar esta aba" variant="ghost" onPress={closeTab} /> : null}
        <Button label="Voltar ao início" variant="ghost" onPress={home} />
      </Result>
    );
  }

  return (
    <Screen header={<ScreenHeader title="Assinatura" back={false} />} contentStyle={{ justifyContent: "center", flexGrow: 1 }}>
      <Card style={{ alignItems: "center", gap: 14, paddingVertical: 28 }}>{body}</Card>
    </Screen>
  );
}

function Result({ icon, tint, title, message, children }: { icon?: string; tint?: string; title: string; message: string; children?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <>
      {icon ? <Icon name={icon} size={44} color={tint ?? colors.textMuted} /> : null}
      <Text variant="heading" align="center">
        {title}
      </Text>
      <Text tone="muted" align="center">
        {message}
      </Text>
      <View style={{ alignSelf: "stretch", gap: 8, alignItems: "center" }}>{children}</View>
    </>
  );
}

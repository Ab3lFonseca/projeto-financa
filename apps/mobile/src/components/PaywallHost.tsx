import { router } from "expo-router";
import { View } from "react-native";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { usePaywall } from "@/lib/paywall";
import { useTheme } from "@/theme/ThemeProvider";

/** Folha "Seu teste grátis acabou": aparece quando o servidor recusa uma edição por falta de assinatura. Montada uma vez na raiz do app. */
export function PaywallHost() {
  const visible = usePaywall((s) => s.visible);
  const hide = usePaywall((s) => s.hide);
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={hide} scroll={false}>
      <View style={{ gap: 16, paddingBottom: 8 }}>
        <View style={{ alignItems: "center", gap: 12 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
            <Icon name="lock" size={26} color={colors.primary} />
          </View>
          <Text variant="heading" align="center">
            Seu teste grátis acabou
          </Text>
          <Text tone="muted" align="center">
            Para criar e editar é preciso assinar. Enquanto isso, seus dados continuam todos aqui: você pode ver tudo e exportar quando quiser.
          </Text>
        </View>
        <View style={{ gap: 8 }}>
          <Button
            label="Ver planos"
            onPress={() => {
              hide();
              router.push("/subscription" as never);
            }}
          />
          <Button label="Agora não" variant="ghost" onPress={hide} />
        </View>
      </View>
    </Sheet>
  );
}

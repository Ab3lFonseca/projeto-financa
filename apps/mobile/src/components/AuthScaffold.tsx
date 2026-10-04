import type { ReactNode } from "react";
import { Image, View } from "react-native";
import { Screen } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";

/** Moldura das telas de login/cadastro: marca, título e conteúdo centralizado. */
export function AuthScaffold({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Screen keyboard contentStyle={{ flexGrow: 1, justifyContent: "center", gap: 24, maxWidth: 480, width: "100%", alignSelf: "center" }}>
      <View style={{ gap: 16, alignItems: "flex-start" }}>
        <Image source={require("../../assets/icon.png")} style={{ width: 56, height: 56, borderRadius: 16 }} accessibilityLabel="Finança" />
        <View style={{ gap: 6 }}>
          <Text variant="title">{title}</Text>
          {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
        </View>
      </View>
      <View style={{ gap: 16 }}>{children}</View>
      {footer}
    </Screen>
  );
}

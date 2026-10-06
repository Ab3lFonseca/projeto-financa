import type { ReactNode } from "react";
import { Image, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { Reveal, Screen } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";

/** Moldura das telas de login/cadastro: fundo de luz animado, marca, título e conteúdo centralizado, entrando em cascata. */
export function AuthScaffold({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Screen keyboard background={<AmbientBackground />} contentStyle={{ flexGrow: 1, justifyContent: "center", gap: 24, maxWidth: 480, width: "100%", alignSelf: "center" }}>
      <View style={{ gap: 16, alignItems: "flex-start" }}>
        <Animated.View entering={ZoomIn.delay(80).springify().damping(13)}>
          <Image source={require("../../assets/icon.png")} style={{ width: 56, height: 56, borderRadius: 16 }} accessibilityLabel="Finança" />
        </Animated.View>
        <Reveal index={1}>
          <View style={{ gap: 6 }}>
            <Text variant="title">{title}</Text>
            {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
          </View>
        </Reveal>
      </View>
      <Reveal index={2}>
        <View style={{ gap: 16 }}>{children}</View>
      </Reveal>
      {footer ? <Reveal index={3}>{footer}</Reveal> : null}
    </Screen>
  );
}

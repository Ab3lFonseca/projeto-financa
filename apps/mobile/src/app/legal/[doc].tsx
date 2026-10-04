import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { Text } from "@/components/ui/Text";
import { Screen, ScreenHeader } from "@/components/ui/Layout";
import { LEGAL_DOCS, type LegalDocKey } from "@/content/legal";

/** Termos de Uso e Política de Privacidade. Acessível antes e depois do login. */
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = LEGAL_DOCS[(doc === "privacy" ? "privacy" : "terms") as LegalDocKey];
  return (
    <Screen header={<ScreenHeader title={content.title} subtitle={`Atualizado em ${content.updatedAt}`} />}>
      {content.intro ? <Text tone="muted">{content.intro}</Text> : null}
      {content.sections.map((s) => (
        <View key={s.heading} style={{ gap: 8 }}>
          <Text variant="heading">{s.heading}</Text>
          {s.paragraphs.map((p, i) => (
            <Text key={i} tone="muted">
              {p}
            </Text>
          ))}
        </View>
      ))}
    </Screen>
  );
}

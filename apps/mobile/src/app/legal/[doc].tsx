import { useLocalSearchParams } from "expo-router";
import { LegalView } from "@/components/legal/LegalView";
import { Screen, ScreenHeader } from "@/components/ui/Layout";
import { LEGAL_DOCS, type LegalDocKey } from "@/content/legal";

/** Termos de Uso e Política de Privacidade. Acessível antes e depois do login. */
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = LEGAL_DOCS[(doc === "privacy" ? "privacy" : "terms") as LegalDocKey];
  return (
    <Screen header={<ScreenHeader title={content.title} subtitle={`Versão ${content.version}`} backTo="/more" />}>
      <LegalView key={content.key} doc={content} />
    </Screen>
  );
}

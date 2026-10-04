import { router } from "expo-router";
import { useState } from "react";
import { AuthScaffold } from "@/components/AuthScaffold";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { errorText } from "@/components/ui/ApiErrorMessage";
import { Text } from "@/components/ui/Text";
import { api } from "@/lib/api/endpoints";
import { useAuth, useMe } from "@/lib/auth/AuthProvider";
import { toast } from "@/lib/ui-store";

/** Exibida quando os Termos/Política mudaram (ou faltam aceites): bloqueia o app até aceitar. */
export default function ConsentScreen() {
  const me = useMe();
  const { refreshMe, signOut } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true);
    try {
      await api.privacy.setConsent("TERMS", me.legalVersions.terms, true);
      await api.privacy.setConsent("PRIVACY", me.legalVersions.privacy, true);
      await refreshMe();
      router.replace("/");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScaffold title="Atualizamos nossos termos" subtitle="Para continuar, leia e aceite os documentos atualizados.">
      <Checkbox checked={accepted} onChange={setAccepted}>
        <Text variant="bodySm" tone="muted">
          Li e aceito os{" "}
          <Text variant="bodySm" tone="primary" weight="600" onPress={() => router.push("/legal/terms")}>
            Termos de Uso
          </Text>{" "}
          e a{" "}
          <Text variant="bodySm" tone="primary" weight="600" onPress={() => router.push("/legal/privacy")}>
            Política de Privacidade
          </Text>
          .
        </Text>
      </Checkbox>
      <Button label="Aceitar e continuar" onPress={accept} loading={busy} disabled={!accepted} size="lg" />
      <Button label="Sair" variant="ghost" onPress={() => void signOut()} />
    </AuthScaffold>
  );
}

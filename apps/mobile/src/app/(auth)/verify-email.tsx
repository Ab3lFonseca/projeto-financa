import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { AuthScaffold } from "@/components/AuthScaffold";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Feedback";
import { errorText } from "@/components/ui/ApiErrorMessage";
import { Text } from "@/components/ui/Text";
import { api } from "@/lib/api/endpoints";

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "positive" | "negative"; text: string } | null>(null);

  const resend = async () => {
    if (!email) return;
    setBusy(true);
    try {
      await api.auth.resendVerification(email);
      setMessage({ tone: "positive", text: "Enviamos um novo e-mail de confirmação." });
    } catch (err) {
      setMessage({ tone: "negative", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScaffold title="Confirme seu e-mail" subtitle={email ? `Enviamos um link para ${email}.` : "Enviamos um link de confirmação para o seu e-mail."}>
      <Text tone="muted">Abra o e-mail, toque no link de confirmação e depois volte aqui para entrar. Se não encontrar, olhe a caixa de spam.</Text>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <Button label="Já confirmei — entrar" onPress={() => router.replace("/login")} size="lg" />
      {email ? <Button label="Reenviar e-mail" variant="secondary" onPress={resend} loading={busy} /> : null}
    </AuthScaffold>
  );
}

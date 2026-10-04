import { router } from "expo-router";
import { useState } from "react";
import { AuthScaffold } from "@/components/AuthScaffold";
import { Button } from "@/components/ui/Button";
import { errorText } from "@/components/ui/ApiErrorMessage";
import { TextField } from "@/components/ui/Inputs";
import { Banner } from "@/components/ui/Feedback";
import { api } from "@/lib/api/endpoints";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Informe um e-mail válido.");
    setBusy(true);
    setError(null);
    try {
      await api.auth.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScaffold title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha.">
      {sent ? (
        <Banner tone="positive" icon="circle-check">
          Se existir uma conta com este e-mail, você receberá as instruções em instantes. Confira também o spam.
        </Banner>
      ) : (
        <>
          <TextField label="E-mail" value={email} onChangeText={setEmail} error={error} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="voce@email.com" onSubmitEditing={submit} />
          <Button label="Enviar link" onPress={submit} loading={busy} size="lg" />
        </>
      )}
      <Button label="Voltar para o login" variant="ghost" onPress={() => router.replace("/login")} />
    </AuthScaffold>
  );
}

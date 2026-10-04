import { Link, router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { AuthScaffold } from "@/components/AuthScaffold";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Inputs";
import { Text } from "@/components/ui/Text";
import { errorText } from "@/components/ui/ApiErrorMessage";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED") {
        router.push({ pathname: "/verify-email", params: { email: email.trim() } });
      } else {
        setError(errorText(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScaffold
      title="Bem-vindo de volta"
      subtitle="Entre para ver suas finanças."
      footer={
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
          <Text tone="muted">Ainda não tem conta?</Text>
          <Link href="/register">
            <Text tone="primary" weight="600">
              Criar conta
            </Text>
          </Link>
        </View>
      }
    >
      <TextField label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="voce@email.com" returnKeyType="next" />
      <TextField label="Senha" value={password} onChangeText={setPassword} secure autoCapitalize="none" autoComplete="current-password" textContentType="password" placeholder="Sua senha" returnKeyType="go" onSubmitEditing={submit} />
      {error ? (
        <Text tone="negative" variant="bodySm" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button label="Entrar" onPress={submit} loading={busy} size="lg" />
      <Link href="/forgot-password" style={{ alignSelf: "center" }}>
        <Text tone="primary" weight="600" variant="bodySm">
          Esqueci minha senha
        </Text>
      </Link>
    </AuthScaffold>
  );
}

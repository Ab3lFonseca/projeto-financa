import { Link, router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { AuthScaffold } from "@/components/AuthScaffold";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { TextField } from "@/components/ui/Inputs";
import { Text } from "@/components/ui/Text";
import { errorText } from "@/components/ui/ApiErrorMessage";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { LEGAL_VERSION } from "@/lib/config";

const checks = [
  { label: "10 caracteres ou mais", ok: (p: string) => p.length >= 10 },
  { label: "letras e números", ok: (p: string) => /[A-Za-z]/.test(p) && /\d/.test(p) },
];

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [triedSubmit, setTriedSubmit] = useState(false);

  const submit = async () => {
    setTriedSubmit(true);
    setError(null);
    setFields({});
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setFields({ email: "Informe um e-mail válido." });
    if (!checks.every((c) => c.ok(password))) return setFields({ password: "A senha precisa de 10+ caracteres, com letras e números." });
    if (password !== confirm) return setFields({ confirm: "As senhas não conferem." });
    if (!terms) return;
    setBusy(true);
    try {
      const signedIn = await signUp({
        email,
        password,
        displayName: name.trim() || undefined,
        termsVersion: LEGAL_VERSION,
        privacyVersion: LEGAL_VERSION,
        marketingOptIn: marketing,
      });
      if (signedIn) router.replace("/");
      else router.replace({ pathname: "/verify-email", params: { email: email.trim() } });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) setFields(err.fieldErrors);
      else setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScaffold
      title="Crie sua conta"
      subtitle="Leva menos de um minuto. Seus dados são só seus."
      footer={
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
          <Text tone="muted">Já tem conta?</Text>
          <Link href="/login">
            <Text tone="primary" weight="600">
              Entrar
            </Text>
          </Link>
        </View>
      }
    >
      <TextField label="Nome (opcional)" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Como podemos te chamar?" />
      <TextField label="E-mail" value={email} onChangeText={setEmail} error={fields.email} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="voce@email.com" />
      <View style={{ gap: 8 }}>
        <TextField label="Senha" value={password} onChangeText={setPassword} error={fields.password} secure autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" placeholder="Crie uma senha forte" />
        <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
          {checks.map((c) => (
            <Text key={c.label} variant="caption" tone={c.ok(password) ? "positive" : "faint"}>
              {c.ok(password) ? "✓" : "•"} {c.label}
            </Text>
          ))}
        </View>
      </View>
      <TextField label="Confirmar senha" value={confirm} onChangeText={setConfirm} error={fields.confirm} secure autoCapitalize="none" autoComplete="new-password" placeholder="Repita a senha" />

      <View style={{ gap: 12, marginTop: 4 }}>
        <Checkbox checked={terms} onChange={setTerms} error={triedSubmit && !terms}>
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
          {triedSubmit && !terms ? (
            <Text variant="caption" tone="negative">
              É necessário aceitar para criar a conta.
            </Text>
          ) : null}
        </Checkbox>
        <Checkbox checked={marketing} onChange={setMarketing}>
          <Text variant="bodySm" tone="muted">
            Quero receber novidades e dicas por e-mail (opcional).
          </Text>
        </Checkbox>
      </View>

      {error ? (
        <Text tone="negative" variant="bodySm" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button label="Criar conta" onPress={submit} loading={busy} size="lg" />
    </AuthScaffold>
  );
}

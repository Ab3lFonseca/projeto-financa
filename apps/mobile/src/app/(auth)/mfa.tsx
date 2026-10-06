import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AuthScaffold } from "@/components/AuthScaffold";
import { Icon } from "@/components/Icon";
import { errorText } from "@/components/ui/ApiErrorMessage";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Inputs";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";

/** Segundo passo do login quando a conta tem verificação em duas etapas: o código de 6 números do aplicativo autenticador. */
export default function MfaScreen() {
  const { status, completeMfa, signOut } = useAuth();
  const { colors } = useTheme();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = useRef<string | null>(null);

  // Sem verificação pendente (abriu esta tela sem querer ou já terminou): vai para o lugar certo.
  useEffect(() => {
    if (status === "signedIn") router.replace("/");
    else if (status === "signedOut") router.replace("/login");
  }, [status]);

  const submit = async (value: string) => {
    if (!/^\d{6}$/.test(value) || sent.current === value) return;
    sent.current = value;
    setBusy(true);
    setError(null);
    try {
      await completeMfa(value);
      router.replace("/");
    } catch (err) {
      setError(errorText(err));
      setCode("");
      sent.current = null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScaffold
      title="Confirme que é você"
      subtitle="Abra o seu aplicativo autenticador e digite o código de 6 números."
      footer={
        <Button
          label="Entrar com outra conta"
          variant="ghost"
          size="sm"
          onPress={async () => {
            await signOut();
            router.replace("/login");
          }}
        />
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.primarySoft }}>
        <Icon name="shield-check" size={20} color={colors.primary} />
        <Text variant="bodySm" style={{ flex: 1 }}>
          Sua conta usa verificação em duas etapas: pedimos o código sempre que você entra ou abre o app. Ele muda a cada 30 segundos. Depois de 3 códigos errados, você é desconectado por segurança.
        </Text>
      </View>
      <TextField
        label="Código de 6 números"
        value={code}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, "").slice(0, 6);
          setCode(digits);
          if (digits.length === 6) void submit(digits);
        }}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        inputMode="numeric"
        maxLength={6}
        autoFocus
        placeholder="000000"
        error={error}
        returnKeyType="go"
        onSubmitEditing={() => void submit(code)}
      />
      <Button label="Confirmar" size="lg" loading={busy} disabled={code.length !== 6} onPress={() => void submit(code)} />
      <Text variant="caption" tone="faint" align="center">
        Perdeu o celular? Fale com o suporte em Ajuda e suporte: depois de confirmarmos que a conta é sua, desligamos a verificação.
      </Text>
    </AuthScaffold>
  );
}

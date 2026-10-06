import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { AuthScaffold } from "@/components/AuthScaffold";
import { errorText } from "@/components/ui/ApiErrorMessage";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthProvider";
import { takeOAuthVerifier } from "@/lib/oauth";
import { useTheme } from "@/theme/ThemeProvider";

/** Para onde o Google, o Facebook etc. devolvem a pessoa: troca o código pela sessão (com o segredo guardado no aparelho) e abre o app. */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const { signInWithOAuth } = useAuth();
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      if (params.error) {
        // A pessoa recusou ou o provedor falhou: não é erro nosso, só voltamos ao login com uma explicação.
        setError(params.error === "access_denied" ? "Você cancelou a entrada. Tudo certo, é só tentar de novo." : "O provedor não conseguiu concluir a entrada. Tente de novo ou use e-mail e senha.");
        return;
      }
      const code = params.code;
      const verifier = await takeOAuthVerifier();
      if (!code || !verifier) {
        setError("Este link de entrada expirou ou já foi usado. Volte e toque no botão de novo.");
        return;
      }
      try {
        const res = await signInWithOAuth(code, verifier);
        router.replace(res.mfaRequired ? "/mfa" : "/");
      } catch (err) {
        setError(errorText(err));
      }
    })();
  }, [params.code, params.error, signInWithOAuth]);

  return (
    <AuthScaffold title={error ? "Não deu certo" : "Entrando…"} subtitle={error ?? "Só um instante, estamos concluindo o seu acesso."}>
      {error ? (
        <Button label="Voltar para entrar" size="lg" onPress={() => router.replace("/login")} />
      ) : (
        <View style={{ alignItems: "center", paddingVertical: 12 }}>
          <ActivityIndicator color={colors.primary} />
          <Text variant="caption" tone="faint" style={{ marginTop: 8 }}>
            Isso leva poucos segundos.
          </Text>
        </View>
      )}
    </AuthScaffold>
  );
}

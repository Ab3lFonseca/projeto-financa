import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { AuthScaffold } from "@/components/AuthScaffold";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Feedback";
import { TextField } from "@/components/ui/Inputs";
import { Text } from "@/components/ui/Text";
import { errorText } from "@/components/ui/ApiErrorMessage";
import { api } from "@/lib/api/endpoints";
import { parseAuthRedirect } from "@/lib/auth-redirect";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * Para onde o link do e-mail de confirmação leva (a API pede ao Supabase `redirect_to` = esta tela). Fica fora dos grupos
 * (auth)/(app), então abre com ou sem login. Mostra só mensagens fixas: nada do que vem na URL é exibido.
 */
export default function ConfirmEmailScreen() {
  const { status } = useAuth();
  const nativeUrl = Linking.useURL();
  // Na web o resultado vem no fragmento (#...) da página: lemos uma vez, na primeira renderização.
  const [webUrl] = useState(() => (Platform.OS === "web" && typeof window !== "undefined" ? window.location.href : null));
  const result = useMemo(() => parseAuthRedirect(Platform.OS === "web" ? webUrl : nativeUrl), [webUrl, nativeUrl]);

  // O fragmento traz uma sessão válida: tira da barra de endereço e do histórico assim que lido. O roteador reescreve a URL
  // original logo depois da montagem, então repete a limpeza até ele assentar.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const scrub = () => {
      if (window.location.hash || window.location.search) window.history.replaceState(null, "", window.location.pathname);
    };
    scrub();
    const timers = [100, 400, 1200].map((ms) => setTimeout(scrub, ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "positive" | "negative"; text: string } | null>(null);

  const resend = async () => {
    if (!email.trim()) {
      setMessage({ tone: "negative", text: "Informe o e-mail do cadastro." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.auth.resendVerification(email.trim());
      setMessage({ tone: "positive", text: "Se existir um cadastro pendente para esse e-mail, enviamos um novo link." });
    } catch (err) {
      setMessage({ tone: "negative", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const signedIn = status === "signedIn";
  const goNext = <Button label={signedIn ? "Ir para o início" : "Entrar"} onPress={() => router.replace(signedIn ? "/" : "/login")} size="lg" />;

  if (result.kind === "success") {
    const emailChanged = result.flow === "email_change";
    return (
      <AuthScaffold
        title={emailChanged ? "E-mail atualizado" : result.flow === "signup" ? "E-mail confirmado!" : "Link verificado"}
        subtitle={result.flow === "signup" ? "Sua conta está pronta." : "Tudo certo com o link do e-mail."}
      >
        <Banner tone="positive">
          {result.flow === "signup"
            ? "Confirmamos o seu e-mail. Entre com o e-mail e a senha que você cadastrou."
            : emailChanged
              ? "A troca do e-mail foi confirmada. Use o novo endereço para entrar."
              : "O link foi verificado. Volte ao app para continuar."}
        </Banner>
        {goNext}
      </AuthScaffold>
    );
  }

  if (result.kind === "error") {
    const expired = result.reason === "expired";
    return (
      <AuthScaffold
        title={expired ? "Link expirado ou já usado" : "Não foi possível confirmar"}
        subtitle={expired ? "Esse link de confirmação não vale mais." : "Algo deu errado com o link do e-mail."}
      >
        <Text tone="muted">
          {expired
            ? "Os links valem por pouco tempo e só funcionam uma vez. Se você já confirmou, é só entrar. Se não, peça um novo e-mail abaixo."
            : "Tente entrar com o seu e-mail e senha. Se o app avisar que falta confirmar, peça um novo e-mail abaixo."}
        </Text>
        <TextField label="E-mail do cadastro" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="voce@email.com" returnKeyType="send" onSubmitEditing={resend} />
        {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
        <Button label="Enviar novo e-mail" onPress={resend} loading={busy} size="lg" />
        <Button label={signedIn ? "Ir para o início" : "Entrar"} variant="secondary" onPress={() => router.replace(signedIn ? "/" : "/login")} />
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold title="Confirmação de e-mail" subtitle="Abra o link que enviamos para o seu e-mail.">
      <Text tone="muted">Esta página recebe o resultado do link de confirmação. Se você chegou aqui sem clicar no link do e-mail, volte e use o link enviado ao seu e-mail.</Text>
      {goNext}
    </AuthScaffold>
  );
}

import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { BadgeWatcher } from "@/components/badges/BadgeWatcher";
import { FirstRunHost } from "@/components/FirstRunHost";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";

/** Todas as telas daqui exigem sessão e o aceite dos termos vigentes. */
export default function AppLayout() {
  const { status, me } = useAuth();
  const { colors } = useTheme();

  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  // A senha foi aceita, mas a conta tem verificação em duas etapas: falta o código antes de abrir qualquer tela do app.
  if (status === "mfa") return <Redirect href="/mfa" />;
  if (status === "signedOut" || !me) return <Redirect href="/login" />;

  return (
    <>
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={!me.consentRequired}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="transaction/new" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="transfer/new" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        </Stack.Protected>
        <Stack.Protected guard={me.consentRequired}>
          <Stack.Screen name="consent" />
        </Stack.Protected>
      </Stack>
      {/* Primeiro acesso: pergunta da verificação em duas etapas e aviso do teste grátis (só depois de aceitar os Termos). */}
      <FirstRunHost />
      {/* Insígnias: confere ao abrir, ao voltar e depois de salvar, e comemora na tela o que for conquistado (só depois do aceite dos Termos). */}
      {!me.consentRequired ? <BadgeWatcher /> : null}
    </>
  );
}

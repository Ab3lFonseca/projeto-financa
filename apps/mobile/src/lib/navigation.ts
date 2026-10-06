import { router } from "expo-router";
import { Platform } from "react-native";

/**
 * Voltar para a tela de onde a pessoa veio. Telas fora da pilha principal (como Termos e Política de Privacidade, que também abrem antes do
 * login) não têm "voltar" do roteador: `router.canGoBack()` é falso e o app caía sempre no Início. Na web usa o histórico do navegador; sem
 * histórico nenhum (link aberto direto), vai para `fallback`.
 */
export function goBack(fallback: string = "/"): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  if (Platform.OS === "web" && typeof window !== "undefined" && window.history.length > 1) {
    window.history.back();
    return;
  }
  router.replace(fallback as never);
}

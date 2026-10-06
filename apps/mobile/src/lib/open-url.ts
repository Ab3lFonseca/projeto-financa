import { Linking, Platform } from "react-native";

/**
 * Abre um endereço externo (página de pagamento, portal da assinatura). Na web, na MESMA aba: a pessoa paga e volta para o site pelo
 * endereço de retorno, e navegadores costumam bloquear janelas abertas depois de uma chamada à API.
 */
export async function openExternal(url: string): Promise<void> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.location.assign(url);
    return;
  }
  await Linking.openURL(url);
}

/**
 * Abre um link que leva a OUTRO aplicativo (e-mail, WhatsApp). Na web, o WhatsApp abre numa aba nova, para a pessoa não perder o app;
 * `mailto:` abre o programa de e-mail sem sair da página.
 */
export async function openLink(url: string): Promise<void> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (url.startsWith("mailto:")) window.location.href = url;
    else window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await Linking.openURL(url);
}

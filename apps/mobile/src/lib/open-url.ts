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

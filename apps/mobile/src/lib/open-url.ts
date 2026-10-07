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

/** Uma aba (ou janela) reservada para a página de pagamento, aberta no instante do toque, antes de a API responder. */
export type ReservedTab = {
  /** `true` = o pagamento abre numa aba SEPARADA e o app continua aberto aqui (é para esperar a confirmação). `false` = vai trocar esta aba. */
  separate: boolean;
  /** Leva a aba reservada ao endereço do pagamento. */
  go: (url: string) => void;
  /** Fecha a aba reservada (a API falhou e não há o que abrir). */
  close: () => void;
};

/**
 * Reserva a aba do pagamento. Na web, o app abre o Stripe numa aba nova (precisa ser no toque, senão o navegador bloqueia) e fica esperando aqui:
 * trocar a MESMA aba enche o histórico e o "voltar" do navegador volta para a página de pagamento em ciclo. Sem aba nova (celular, janela
 * bloqueada), cai no jeito antigo: troca a aba atual, sem deixar a página do app no histórico.
 */
export function reserveExternalTab(): ReservedTab {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    let tab: Window | null = null;
    try {
      tab = window.open("", "_blank");
    } catch {
      tab = null;
    }
    if (tab) {
      const opened = tab;
      try {
        opened.opener = null; // a aba do pagamento não precisa (nem deve) controlar esta
        opened.document.title = "Finança";
        opened.document.body.textContent = "Abrindo o pagamento seguro…";
      } catch {
        /* só enfeite */
      }
      return {
        separate: true,
        go: (url) => opened.location.replace(url),
        close: () => {
          try {
            opened.close();
          } catch {
            /* já fechada */
          }
        },
      };
    }
    return { separate: false, go: (url) => window.location.replace(url), close: () => undefined };
  }
  return { separate: false, go: (url) => void Linking.openURL(url), close: () => undefined };
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

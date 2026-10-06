/**
 * Canais de contato com o suporte. Os links abrem direto no aplicativo certo: o e-mail no programa de e-mail do aparelho e o WhatsApp
 * (wa.me) no aplicativo do WhatsApp, ou no WhatsApp Web no computador.
 */
export const SUPPORT = {
  email: "financascontact2026@gmail.com",
  /** DDI 55 (Brasil) + DDD 47 + número, só dígitos: é o formato que o wa.me exige. */
  whatsappDigits: "5547992920469",
  whatsappDisplay: "(47) 99292-0469",
} as const;

/** Link `mailto:` com assunto e texto já preenchidos (opcionais). */
export function mailtoLink(subject?: string, body?: string): string {
  const parts: string[] = [];
  if (subject) parts.push(`subject=${encodeURIComponent(subject)}`);
  if (body) parts.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${SUPPORT.email}${parts.length > 0 ? `?${parts.join("&")}` : ""}`;
}

/** Link do WhatsApp com a mensagem inicial já escrita (opcional). */
export function whatsappLink(text?: string): string {
  return `https://wa.me/${SUPPORT.whatsappDigits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** O que o suporte NUNCA pede: vale repetir sempre que o contato aparece (golpes de falso suporte são comuns). */
export const SUPPORT_NEVER_ASKS = ["sua senha do Finança ou do seu banco", "o código de 6 números do aplicativo autenticador", "o número completo, a validade ou o CVV do cartão"] as const;

/** Dúvidas que mais aparecem, com a resposta e onde resolver sozinho. */
export const SUPPORT_FAQ = [
  { id: "senha", icon: "key-round", question: "Esqueci a minha senha", answer: "Na tela de entrada, toque em “Esqueci minha senha” e confira o e-mail. Já está logado(a)? Vá em Configurações → Minha conta → Enviar link de redefinição por e-mail." },
  { id: "celular", icon: "smartphone", question: "Perdi o celular com o autenticador", answer: "Escreva para o suporte, do mesmo e-mail da conta, e conte o que aconteceu. Depois de confirmarmos que a conta é sua, desligamos a verificação em duas etapas e você entra de novo só com a senha." },
  { id: "cancelar", icon: "undo-2", question: "Como cancelo a assinatura?", answer: "Em Mais → Assinatura → Gerenciar assinatura. O cancelamento é sem multa e o acesso continua até o fim do período já pago. Nos 7 primeiros dias você ainda tem o direito de arrependimento." },
  { id: "excluir", icon: "trash", question: "Como excluo minha conta e meus dados?", answer: "Em Configurações → Privacidade e dados → Excluir minha conta. É definitivo: apaga tudo e cancela a assinatura. Antes, você pode exportar os seus dados no mesmo lugar." },
  { id: "email", icon: "mail", question: "Quero trocar o e-mail da conta", answer: "Em Configurações → Minha conta → E-mail. Você confirma o endereço novo por um link. Há um limite de trocas por mês e por ano, para a sua segurança." },
  { id: "golpe", icon: "shield-alert", question: "Recebi uma mensagem pedindo senha ou código", answer: "É golpe. O suporte do Finança nunca pede a sua senha, o código do autenticador nem os dados do cartão. Não responda e, se quiser, nos avise." },
] as const;

/** Assuntos sugeridos (viram o assunto do e-mail e a primeira linha do WhatsApp). */
export const SUPPORT_TOPICS = [
  { id: "help", label: "Preciso de ajuda", message: "Olá! Preciso de ajuda com o Finança." },
  { id: "billing", label: "Assinatura e pagamento", message: "Olá! Tenho uma dúvida sobre a assinatura do Finança." },
  { id: "account", label: "Minha conta ou acesso", message: "Olá! Estou com um problema para acessar a minha conta do Finança." },
  { id: "privacy", label: "Privacidade e meus dados (LGPD)", message: "Olá! Quero exercer um direito sobre os meus dados pessoais no Finança." },
  { id: "idea", label: "Sugestão ou elogio", message: "Olá! Tenho uma sugestão para o Finança." },
] as const;

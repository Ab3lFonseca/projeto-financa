import { SUGGESTION_MAX, SUGGESTION_MIN, SUGGESTION_STATUS_LABEL, type SuggestionStatusName } from "@app/shared";

/** Confere o texto antes de enviar (o servidor confere de novo): tamanho, contador e a dica do que falta. */
export function suggestionCheck(text: string): { ok: boolean; length: number; hint: string | null } {
  // mesmo critério do servidor: espaços das pontas não contam
  const length = text.trim().length;
  if (length === 0) return { ok: false, length, hint: `Escreva pelo menos ${SUGGESTION_MIN} caracteres.` };
  if (length < SUGGESTION_MIN) return { ok: false, length, hint: `Faltam ${SUGGESTION_MIN - length} caracteres.` };
  if (length > SUGGESTION_MAX) return { ok: false, length, hint: `Passou ${length - SUGGESTION_MAX} caracteres do limite.` };
  return { ok: true, length, hint: null };
}

/** Contador "123/1000". */
export const suggestionCounter = (text: string) => `${text.trim().length}/${SUGGESTION_MAX}`;

export type StatusLook = { label: string; tone: "default" | "positive" | "negative"; icon: string };

/** Como a PESSOA vê a situação da sua sugestão: texto, cor do selo e ícone. */
export function statusLook(status: SuggestionStatusName): StatusLook {
  const label = SUGGESTION_STATUS_LABEL[status].user;
  switch (status) {
    case "APPROVED":
      return { label, tone: "positive", icon: "circle-check" };
    case "REJECTED":
      return { label, tone: "negative", icon: "circle-x" };
    default:
      return { label, tone: "default", icon: "clock" };
  }
}

/** Os três botões do quadro do administrador: verde (válida), vermelho (não válida) e branco (em análise), nessa ordem. */
export const DECISIONS: { status: SuggestionStatusName; label: string; color: "green" | "red" | "white"; icon: string; done: string }[] = [
  { status: "APPROVED", label: SUGGESTION_STATUS_LABEL.APPROVED.button, color: "green", icon: "circle-check", done: "Marcada como válida: passa para a validação." },
  { status: "REJECTED", label: SUGGESTION_STATUS_LABEL.REJECTED.button, color: "red", icon: "circle-x", done: "Marcada como não válida: não passa pela validação." },
  { status: "PENDING", label: SUGGESTION_STATUS_LABEL.PENDING.button, color: "white", icon: "clock", done: "Devolvida para análise." },
];

/** Abas do quadro, com o total de cada situação. */
export function boardTabs(counts: Record<SuggestionStatusName, number>): { status: SuggestionStatusName; label: string }[] {
  return [
    { status: "PENDING", label: `Em análise (${counts.PENDING})` },
    { status: "APPROVED", label: `Válidas (${counts.APPROVED})` },
    { status: "REJECTED", label: `Não válidas (${counts.REJECTED})` },
  ];
}

/** "Falta 1 sugestão para hoje" / "Você já enviou o máximo de hoje". */
export function remainingText(remaining: number): string {
  if (remaining <= 0) return "Você já enviou o máximo de hoje. Volte amanhã para mandar mais.";
  return remaining === 1 ? "Você ainda pode enviar 1 sugestão hoje." : `Você ainda pode enviar ${remaining} sugestões hoje.`;
}

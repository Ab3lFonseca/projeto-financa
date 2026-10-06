import type { Me } from "./api/endpoints";

/** O que mostrar no primeiro acesso, nesta ordem: a pergunta da verificação em duas etapas e o aviso do teste grátis. Cada um sai uma vez só. */
export type FirstRunStep = "security" | "trial";

/**
 * Qual é o próximo aviso de primeiro acesso, ou `null` se não há nenhum. `dismissed` guarda o que a pessoa acabou de fechar (some na hora,
 * sem esperar a resposta do servidor). Só vale depois de aceitar os Termos. Campos que o servidor ainda não manda (app mais novo que a API)
 * contam como "nada a mostrar", nunca como erro.
 */
export function nextFirstRunStep(me: Me | null, dismissed: ReadonlySet<FirstRunStep> = new Set()): FirstRunStep | null {
  if (!me || me.consentRequired) return null;
  if (me.security && !me.security.promptAnswered && !me.security.mfaEnabled && !dismissed.has("security")) return "security";
  const { billingEnforced, access } = me.entitlements;
  if (billingEnforced && access.state === "trial" && me.notices && !me.notices.trialIntroSeen && !dismissed.has("trial")) return "trial";
  return null;
}

import type { ChangeLimitState } from "@app/shared";

/** Nome amigável de cada forma de entrar. */
const PROVIDER_LABEL: Record<string, string> = {
  email: "E-mail e senha",
  google: "Google",
  facebook: "Facebook",
  apple: "Apple",
  azure: "Microsoft",
  twitter: "X (Twitter)",
  discord: "Discord",
  linkedin_oidc: "LinkedIn",
  github: "GitHub",
};

export function providerLabel(id: string): string {
  return PROVIDER_LABEL[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** "12/11/2026" */
export function dateBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "12/11/2026 às 14:30" */
export function dateTimeBR(iso: string): string {
  const d = new Date(iso);
  return `${dateBR(iso)} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Quantas trocas ainda restam, ou quando libera de novo. Mostrado embaixo de cada campo que tem limite. */
export function limitText(s: ChangeLimitState): string {
  if (!s.canChange) {
    return s.nextAvailableAt ? `Limite atingido. Você poderá alterar de novo em ${dateBR(s.nextAvailableAt)}.` : "Limite atingido por enquanto.";
  }
  const month = Math.max(0, s.perMonth.max - s.perMonth.used);
  const year = Math.max(0, s.perYear.max - s.perYear.used);
  const times = (n: number) => (n === 1 ? "1 troca" : `${n} trocas`);
  return `Restam ${times(month)} neste mês e ${times(year)} neste ano.`;
}

/** Linha do tipo "Cadastro" → "Membro desde 06/10/2026". */
export function memberSince(iso: string): string {
  return `Membro desde ${dateBR(iso)}`;
}

/** Só os 6 dígitos que a pessoa digitou (cola de "123 456" também funciona). */
export function codeDigits(input: string): string {
  return input.replace(/\D/g, "").slice(0, 6);
}

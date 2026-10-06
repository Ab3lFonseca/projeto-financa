import { addDays, type AdminStatsDTO, type ISODate } from "@app/shared";
import { THEME_META } from "@/theme/presets";

/** Cadastros de cada um dos últimos `days` dias (termina em `today`); os dias sem cadastro entram com 0, para o gráfico não "pular" datas. */
export function fillSignups(signupsByDay: AdminStatsDTO["signupsByDay"], today: ISODate, days = 30): { date: ISODate; count: number }[] {
  const byDate = new Map(signupsByDay.map((s) => [s.date, s.count]));
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - (days - 1));
    return { date, count: byDate.get(date) ?? 0 };
  });
}

/** Percentual inteiro de quem concluiu o tutorial; null quando ainda não há usuários. */
export function onboardingRate(completed: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((Math.min(completed, total) / total) * 100);
}

export type ThemeRow = { id: string; label: string; emoji: string; count: number; pct: number };

/** Temas em uso, do mais para o menos usado, com nome e emoji do app. `pct` é a fatia do total (0 a 100). */
export function themeRows(themes: AdminStatsDTO["themes"]): ThemeRow[] {
  const total = Object.values(themes).reduce((sum, n) => sum + n, 0);
  return Object.entries(themes)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => {
      const meta = THEME_META.find((m) => m.id === id);
      return { id, label: meta?.label ?? "Outro", emoji: meta?.emoji ?? "🎨", count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}

/** Inicial para o avatar: primeira letra do nome (ou do e-mail, se a pessoa não tem nome). */
export function userInitial(displayName: string | null, email: string): string {
  const source = (displayName?.trim() || email.trim()).replace(/^[^\p{L}\p{N}]+/u, "");
  return (source.charAt(0) || "?").toLocaleUpperCase("pt-BR");
}

/** Nome para a lista: o escolhido pela pessoa ou, sem nome, a parte do e-mail antes do @ (nunca mostra o e-mail duas vezes). */
export function userLabel(displayName: string | null, email: string): string {
  return displayName?.trim() || email.split("@")[0] || email;
}

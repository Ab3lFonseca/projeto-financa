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

export type ActionLook = { icon: string; tone: "default" | "positive" | "negative" | "warning" | "primary"; verb: string };

const ACTIONS: Record<string, ActionLook> = {
  "admin.user.deleted": { icon: "trash", tone: "negative", verb: "Excluiu a conta de" },
  "admin.user.suspended": { icon: "ban", tone: "warning", verb: "Suspendeu a conta de" },
  "admin.user.reactivated": { icon: "circle-check", tone: "positive", verb: "Reativou a conta de" },
  "admin.user.role_changed": { icon: "shield", tone: "primary", verb: "Mudou o papel de" },
  "admin.user.password_reset_sent": { icon: "mail", tone: "default", verb: "Enviou a redefinição de senha a" },
  "admin.user.viewed": { icon: "eye", tone: "default", verb: "Abriu o cadastro de" },
  "admin.users.listed": { icon: "users", tone: "default", verb: "Consultou a lista de usuários" },
  "admin.access.granted": { icon: "gift", tone: "positive", verb: "Concedeu acesso gratuito a" },
  "admin.access.revoked": { icon: "undo-2", tone: "warning", verb: "Retirou o acesso gratuito de" },
  "admin.trial.extended": { icon: "clock", tone: "primary", verb: "Prorrogou o teste de" },
  "admin.suggestion.decided": { icon: "lightbulb", tone: "primary", verb: "Decidiu uma sugestão de" },
  "admin.mfa.removed": { icon: "smartphone", tone: "warning", verb: "Desligou a verificação em duas etapas de" },
  "admin.bootstrap": { icon: "crown", tone: "primary", verb: "Virou administrador pela configuração do servidor" },
};

/** Como uma ação registrada na auditoria aparece na tela de atividade (ícone, cor e verbo em português). Ação desconhecida não quebra. */
export function describeAdminAction(action: string): ActionLook {
  return ACTIONS[action] ?? { icon: "file-text", tone: "default", verb: action.replace(/^admin\./, "").replace(/[._]/g, " ") };
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

import { z } from "zod";
import { clientPlatform, email } from "./auth";
import { timestamp, uuid } from "./common";

// ------------------------------------------------------------------------------------------------ limites de alteração do cadastro

export const accountChangeKinds = ["NAME", "EMAIL", "PASSWORD"] as const;
export const AccountChangeKind = z.enum(accountChangeKinds);
export type AccountChangeKindName = z.infer<typeof AccountChangeKind>;

/**
 * Quantas vezes a pessoa pode alterar cada dado do cadastro. O mês é uma janela de 30 dias e o ano, de 365 dias, contados para trás a partir de agora
 * (não o mês do calendário: assim ninguém ganha uma rodada nova só porque virou o mês). Evita abuso e pedidos repetidos de e-mail.
 */
export const ACCOUNT_CHANGE_LIMITS: Record<AccountChangeKindName, { perMonth: number; perYear: number }> = {
  NAME: { perMonth: 2, perYear: 6 },
  EMAIL: { perMonth: 1, perYear: 3 },
  PASSWORD: { perMonth: 3, perYear: 12 },
};

export const CHANGE_WINDOW_DAYS = { month: 30, year: 365 } as const;

export const changeLimitDTO = z.object({
  perMonth: z.object({ used: z.number().int(), max: z.number().int() }),
  perYear: z.object({ used: z.number().int(), max: z.number().int() }),
  /** Dá para alterar agora? */
  canChange: z.boolean(),
  /** Quando a próxima alteração é liberada (só se `canChange` for falso). */
  nextAvailableAt: timestamp.nullable(),
});
export type ChangeLimitState = z.infer<typeof changeLimitDTO>;

const DAY_MS = 86_400_000;

/**
 * Situação do limite de uma alteração, a partir dos instantes das alterações anteriores. Bloqueia quando qualquer uma das duas janelas
 * (mês ou ano) já está cheia, e informa quando a mais restritiva libera uma vaga.
 */
export function evaluateChangeLimit(times: Date[], now: Date, limits: { perMonth: number; perYear: number }): ChangeLimitState {
  const within = (days: number) => times.filter((t) => now.getTime() - t.getTime() < days * DAY_MS).sort((a, b) => a.getTime() - b.getTime());
  const month = within(CHANGE_WINDOW_DAYS.month);
  const year = within(CHANGE_WINDOW_DAYS.year);
  // A vaga abre quando a alteração mais antiga que ainda "pesa" sai da janela.
  const freeAt = (list: Date[], max: number, days: number): Date | null => (list.length >= max ? new Date(list[list.length - max]!.getTime() + days * DAY_MS) : null);
  const blockers = [freeAt(month, limits.perMonth, CHANGE_WINDOW_DAYS.month), freeAt(year, limits.perYear, CHANGE_WINDOW_DAYS.year)].filter((d): d is Date => d !== null);
  const next = blockers.length > 0 ? new Date(Math.max(...blockers.map((d) => d.getTime()))) : null;
  return {
    perMonth: { used: month.length, max: limits.perMonth },
    perYear: { used: year.length, max: limits.perYear },
    canChange: next === null,
    nextAvailableAt: next ? next.toISOString() : null,
  };
}

// ------------------------------------------------------------------------------------------------ minha conta

export const securityDTO = z.object({
  mfa: z.object({ enabled: z.boolean(), enabledAt: timestamp.nullable() }),
  /** A conta tem senha própria (cadastro por e-mail). Quem entra só com Google/Facebook... não tem, e pode definir uma. */
  hasPassword: z.boolean(),
  /** Formas de entrar ligadas à conta (ex.: "email", "google"). */
  providers: z.array(z.string()),
  /** O e-mail pode ser trocado aqui (contas com senha). Em contas sociais ele pertence ao provedor. */
  canChangeEmail: z.boolean(),
});

export const myAccountDTO = z.object({
  id: uuid,
  email: z.string(),
  displayName: z.string().nullable(),
  createdAt: timestamp,
  lastSeenAt: timestamp.nullable(),
  locale: z.string(),
  timezone: z.string(),
  currency: z.string(),
  legal: z.object({
    termsVersion: z.string().nullable(),
    termsAcceptedAt: timestamp.nullable(),
    privacyVersion: z.string().nullable(),
    privacyAcceptedAt: timestamp.nullable(),
    marketingOptIn: z.boolean(),
  }),
  security: securityDTO,
  limits: z.object({ NAME: changeLimitDTO, EMAIL: changeLimitDTO, PASSWORD: changeLimitDTO }),
  /** O que a pessoa já registrou (só contagens dos próprios dados). */
  summary: z.object({ accounts: z.number().int(), cards: z.number().int(), transactions: z.number().int(), goals: z.number().int() }),
});
export type MyAccountDTO = z.infer<typeof myAccountDTO>;
export type SecurityDTO = z.infer<typeof securityDTO>;

export const changeEmailBody = z.strictObject({
  newEmail: email,
  /** Reautenticação: trocar o e-mail muda como a pessoa entra. */
  password: z.string().min(1).max(200),
  platform: clientPlatform.optional(),
});

export const changeEmailResponse = z.object({
  ok: z.literal(true),
  /** O e-mail só muda depois que a pessoa confirma o link enviado ao endereço novo. */
  pendingEmail: z.string(),
});

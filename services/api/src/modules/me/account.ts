import type { PrismaClient } from "@app/database";
import { ACCOUNT_CHANGE_LIMITS, accountChangeKinds, evaluateChangeLimit, type AccountChangeKindName, type myAccountDTO, type ChangeLimitState, type SecurityDTO } from "@app/shared";
import type { Tx } from "../../lib/db";
import { Errors } from "../../lib/errors";
import type { AuthUser } from "../../types";
import type { VerifiedToken } from "../auth/token-verifier";

const DAY_MS = 86_400_000;
/** Operações sensíveis de quem entra só por Google/Facebook (sem senha para reconfirmar) pedem um login de até 10 minutos atrás. */
const RECENT_LOGIN_SECONDS = 10 * 60;

/** A conta tem senha própria? Sem informação no token, assume que sim (cadastro por e-mail). */
export function hasPasswordOf(claims: VerifiedToken | null): boolean {
  return !claims || claims.providers.length === 0 || claims.providers.includes("email");
}

export function requireRecentLogin(claims: VerifiedToken | null, now: Date): void {
  if (!claims || now.getTime() / 1000 - claims.authenticatedAt > RECENT_LOGIN_SECONDS) throw Errors.reauthRequired();
}

type Db = PrismaClient | Tx;

/** Situação dos limites de alteração (nome, e-mail, senha) de uma pessoa. */
export async function changeLimits(db: Db, userId: string, now: Date): Promise<Record<AccountChangeKindName, ChangeLimitState>> {
  const rows = await db.accountChange.findMany({
    where: { userId, createdAt: { gte: new Date(now.getTime() - 365 * DAY_MS) } },
    select: { kind: true, createdAt: true },
  });
  const out = {} as Record<AccountChangeKindName, ChangeLimitState>;
  for (const kind of accountChangeKinds) {
    out[kind] = evaluateChangeLimit(rows.filter((r) => r.kind === kind).map((r) => r.createdAt), now, ACCOUNT_CHANGE_LIMITS[kind]);
  }
  return out;
}

const WHAT: Record<AccountChangeKindName, string> = { NAME: "o nome", EMAIL: "o e-mail", PASSWORD: "a senha" };

/** Recusa (429) se a pessoa já usou todas as alterações permitidas, dizendo quando libera de novo. */
export async function assertCanChange(db: Db, userId: string, kind: AccountChangeKindName, now: Date): Promise<void> {
  const state = (await changeLimits(db, userId, now))[kind];
  if (state.canChange) return;
  const when = state.nextAvailableAt ? new Date(state.nextAvailableAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "mais tarde";
  const limits = ACCOUNT_CHANGE_LIMITS[kind];
  throw Errors.changeLimit(
    `Você já alterou ${WHAT[kind]} o máximo de vezes permitido (${limits.perMonth} por mês e ${limits.perYear} por ano). Poderá alterar de novo em ${when}.`,
    { kind, nextAvailableAt: state.nextAvailableAt },
  );
}

export async function recordChange(prisma: PrismaClient, userId: string, kind: AccountChangeKindName, at: Date): Promise<void> {
  await prisma.accountChange.create({ data: { userId, kind, createdAt: at } });
}

export function toSecurityDTO(user: AuthUser, mfaEnabledAt: Date | null, claims: VerifiedToken | null): SecurityDTO {
  const hasPassword = hasPasswordOf(claims);
  const providers = claims && claims.providers.length > 0 ? claims.providers : ["email"];
  return {
    mfa: { enabled: user.mfaEnabled, enabledAt: mfaEnabledAt ? mfaEnabledAt.toISOString() : null },
    hasPassword,
    providers,
    canChangeEmail: hasPassword,
  };
}

/** Dados de cadastro da própria pessoa (a tela "Minha conta"). Roda sob RLS: só enxerga o que é dela. */
export async function buildAccount(prisma: PrismaClient, tx: Tx, user: AuthUser, claims: VerifiedToken | null, now: Date): Promise<myAccountDTO> {
  const row = await tx.user.findUnique({ where: { id: user.id }, select: { email: true, createdAt: true, lastSeenAt: true, mfaEnabledAt: true } });
  const profile = await tx.profile.findUnique({ where: { userId: user.id }, select: { displayName: true, locale: true, timezone: true, currency: true } });
  if (!row || !profile) throw Errors.notFound("Conta");
  const consents = await tx.consent.findMany({
    where: { userId: user.id, revokedAt: null, type: { in: ["TERMS", "PRIVACY", "MARKETING"] } },
    orderBy: { grantedAt: "desc" },
    select: { type: true, version: true, grantedAt: true },
  });
  const latest = (type: string) => consents.find((c) => c.type === type);
  const terms = latest("TERMS");
  const privacy = latest("PRIVACY");
  const [accounts, cards, transactions, goals] = [
    await tx.account.count({ where: { userId: user.id, deletedAt: null } }),
    await tx.creditCard.count({ where: { userId: user.id, deletedAt: null } }),
    await tx.transaction.count({ where: { userId: user.id, deletedAt: null } }),
    await tx.goal.count({ where: { userId: user.id, deletedAt: null } }),
  ];
  const limits = await changeLimits(prisma, user.id, now);
  return {
    id: user.id,
    email: user.email,
    displayName: profile.displayName,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    locale: profile.locale,
    timezone: profile.timezone,
    currency: profile.currency,
    legal: {
      termsVersion: terms?.version ?? null,
      termsAcceptedAt: terms ? terms.grantedAt.toISOString() : null,
      privacyVersion: privacy?.version ?? null,
      privacyAcceptedAt: privacy ? privacy.grantedAt.toISOString() : null,
      marketingOptIn: latest("MARKETING") !== undefined,
    },
    security: toSecurityDTO(user, row.mfaEnabledAt, claims),
    limits,
    summary: { accounts, cards, transactions, goals },
  };
}

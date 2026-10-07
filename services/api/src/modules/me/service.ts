import type { ProfileDTO } from "@app/shared";
import { appearanceSchema, notificationPrefs, type EntitlementsDTO, type MeDTO } from "@app/shared";
import type { Config } from "../../config";
import { toAccessDTO } from "../../lib/access";
import { Errors } from "../../lib/errors";
import { countUsage, limitsFor } from "../../lib/plan";
import type { Tx } from "../../lib/db";
import type { AuthUser } from "../../types";
import type { VerifiedToken } from "../auth/token-verifier";
import { hasPasswordOf } from "./account";

type ProfileRow = {
  displayName: string | null;
  locale: string;
  timezone: string;
  currency: string;
  theme: "SYSTEM" | "LIGHT" | "DARK";
  appearance: unknown;
  notificationPrefs: unknown;
  onboardingCompletedAt: Date | null;
};

export function toProfileDTO(p: ProfileRow): ProfileDTO {
  return {
    displayName: p.displayName,
    locale: p.locale,
    timezone: p.timezone,
    currency: p.currency,
    theme: p.theme,
    // Valor que não passa na validação (editado à mão no banco, por exemplo) vira nulo: o app cai no `theme`.
    appearance: appearanceSchema.safeParse(p.appearance).data ?? null,
    onboardingCompleted: p.onboardingCompletedAt !== null,
    notificationPrefs: notificationPrefs.parse(p.notificationPrefs ?? {}),
  };
}

export async function buildEntitlements(tx: Tx, user: AuthUser, config: Config): Promise<EntitlementsDTO> {
  const limits = limitsFor(user.plan);
  const usage = await countUsage(tx, user.id);
  return {
    plan: user.plan,
    billingEnforced: config.BILLING_ENFORCED,
    trialDays: config.TRIAL_DAYS,
    access: toAccessDTO(user.access),
    limits: {
      accounts: limits.accounts,
      cards: limits.cards,
      goals: limits.goals,
      recurringRules: limits.recurringRules,
    },
    features: {
      openFinance: limits.openFinance && config.OPEN_FINANCE_ENABLED,
      advancedReports: limits.advancedReports,
      advancedInsights: limits.advancedInsights,
      investments: user.access.features.investments,
    },
    usage,
  };
}

export async function buildMe(tx: Tx, user: AuthUser, config: Config, claims: VerifiedToken | null = null): Promise<MeDTO> {
  const profile = await tx.profile.findUnique({ where: { userId: user.id } });
  if (!profile) throw Errors.notFound("Perfil");
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    profile: toProfileDTO(profile),
    security: { mfaEnabled: user.mfaEnabled, mfaFactorId: user.mfaEnabled ? user.mfaFactorId : null, promptAnswered: profile.securityPromptAnsweredAt !== null, hasPassword: hasPasswordOf(claims) },
    notices: { trialIntroSeen: profile.trialIntroSeenAt !== null },
    consentRequired: !user.consentOk,
    legalVersions: { terms: config.LEGAL_TERMS_VERSION, privacy: config.LEGAL_PRIVACY_VERSION },
    entitlements: await buildEntitlements(tx, user, config),
  };
}

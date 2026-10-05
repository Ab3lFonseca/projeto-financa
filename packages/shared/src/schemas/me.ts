import { z } from "zod";
import { ConsentType, Plan, PushPlatform, ThemePreference, UserRole } from "../enums";
import { appearanceSchema } from "./appearance";
import { singleLine, timestamp } from "./common";

export const notificationPrefs = z.object({
  billsDue: z.boolean().default(true),
  invoicesDue: z.boolean().default(true),
  budgets: z.boolean().default(true),
  goals: z.boolean().default(true),
  sync: z.boolean().default(true),
});
export type NotificationPrefs = z.infer<typeof notificationPrefs>;

export const profileDTO = z.object({
  displayName: z.string().nullable(),
  locale: z.string(),
  timezone: z.string(),
  currency: z.string(),
  theme: ThemePreference,
  /** Tema escolhido (inclui as cores personalizadas). Nulo = nunca personalizou: vale `theme`. */
  appearance: appearanceSchema.nullable(),
  onboardingCompleted: z.boolean(),
  notificationPrefs,
});

export const updateProfileBody = z.strictObject({
  displayName: singleLine(100).nullable().optional(),
  timezone: z
    .string()
    .max(64)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-CA", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Fuso horário inválido")
    .optional(),
  theme: ThemePreference.optional(),
  appearance: appearanceSchema.nullable().optional(),
  onboardingCompleted: z.boolean().optional(),
  notificationPrefs: notificationPrefs.partial().optional(),
});

const limitValue = z.number().int().nullable();

export const entitlementsDTO = z.object({
  plan: Plan,
  /** false no beta: todos recebem os recursos do Premium. */
  billingEnforced: z.boolean(),
  limits: z.object({
    accounts: limitValue,
    cards: limitValue,
    goals: limitValue,
    recurringRules: limitValue,
  }),
  features: z.object({
    openFinance: z.boolean(),
    advancedReports: z.boolean(),
    advancedInsights: z.boolean(),
  }),
  usage: z.object({
    accounts: z.number().int(),
    cards: z.number().int(),
    goals: z.number().int(),
    recurringRules: z.number().int(),
  }),
});

export const meDTO = z.object({
  id: z.uuid(),
  email: z.string(),
  role: UserRole,
  profile: profileDTO,
  /** true quando faltam os aceites da versão vigente dos Termos/Privacidade. */
  consentRequired: z.boolean(),
  legalVersions: z.object({ terms: z.string(), privacy: z.string() }),
  entitlements: entitlementsDTO,
});

export const pushTokenBody = z.strictObject({
  expoToken: z.string().min(10).max(200),
  platform: PushPlatform,
  deviceName: singleLine(100).optional(),
});

export const deleteAccountBody = z.strictObject({
  /** Reautenticação: a exclusão é irreversível. */
  password: z.string().min(1).max(200),
  confirm: z.literal("EXCLUIR"),
});

export const consentDTO = z.object({
  type: ConsentType,
  version: z.string(),
  grantedAt: timestamp,
  revokedAt: timestamp.nullable(),
});

export const consentsResponse = z.object({
  legalVersions: z.object({ terms: z.string(), privacy: z.string() }),
  current: z.array(consentDTO),
});

export const setConsentBody = z.strictObject({
  type: ConsentType,
  version: z.string().min(1).max(32),
  granted: z.boolean(),
});

export type MeDTO = z.infer<typeof meDTO>;
export type EntitlementsDTO = z.infer<typeof entitlementsDTO>;
export type ProfileDTO = z.infer<typeof profileDTO>;

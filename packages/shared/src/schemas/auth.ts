import { z } from "zod";
import { singleLine } from "./common";

/** Senha: 10–72 caracteres (72 = limite do bcrypt usado pelo provedor), com letra e número. */
export const password = z
  .string()
  .min(10, "A senha deve ter pelo menos 10 caracteres")
  .max(72, "A senha deve ter no máximo 72 caracteres")
  .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), "A senha deve conter letras e números");

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("E-mail inválido"));

export const registerBody = z.strictObject({
  email,
  password,
  displayName: singleLine(100).optional(),
  acceptTerms: z.literal(true, { error: "É necessário aceitar os Termos de Uso" }),
  acceptPrivacy: z.literal(true, { error: "É necessário aceitar a Política de Privacidade" }),
  termsVersion: z.string().min(1).max(32),
  privacyVersion: z.string().min(1).max(32),
  marketingOptIn: z.boolean().default(false),
});

export const loginBody = z.strictObject({
  email,
  // No login não validamos a força da senha (contas antigas), só o tamanho.
  password: z.string().min(1).max(200),
});

export const refreshBody = z.strictObject({ refreshToken: z.string().min(10).max(2000) });
export const forgotPasswordBody = z.strictObject({ email });
export const resendVerificationBody = z.strictObject({ email });
export const resetPasswordBody = z.strictObject({ password });
export const changePasswordBody = z.strictObject({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

export const sessionResponse = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Segundos até o accessToken expirar. */
  expiresIn: z.number().int(),
  /** Epoch (segundos) de expiração do accessToken. */
  expiresAt: z.number().int(),
  user: z.object({ id: z.uuid(), email: z.string() }),
});

export const registerResponse = z.object({
  /** true quando o provedor exige confirmar o e-mail antes do primeiro login. */
  requiresEmailVerification: z.boolean(),
  session: sessionResponse.nullable(),
});

export type RegisterBody = z.infer<typeof registerBody>;
export type LoginBody = z.infer<typeof loginBody>;
export type SessionResponse = z.infer<typeof sessionResponse>;

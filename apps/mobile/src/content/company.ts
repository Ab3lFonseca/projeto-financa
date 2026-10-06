import Constants from "expo-constants";
import { SUPPORT } from "./contact";

export type Company = { name: string; cnpj: string; dpoEmail: string; supportEmail: string; city: string };

const extra = (Constants.expoConfig?.extra ?? {}) as { company?: Partial<Company> };

/**
 * Dados de quem opera o app, exibidos nos Termos e na Política. Vêm de `app.config.ts → extra.company` (variáveis COMPANY_* no build).
 * O que ainda não foi preenchido não aparece nos textos (nada de "[CNPJ]" na tela); o canal do suporte e do encarregado é o contato do app.
 */
export const COMPANY: Company = {
  name: extra.company?.name || "Finança",
  cnpj: extra.company?.cnpj || "",
  dpoEmail: extra.company?.dpoEmail || SUPPORT.email,
  supportEmail: extra.company?.supportEmail || SUPPORT.email,
  city: extra.company?.city || "",
};

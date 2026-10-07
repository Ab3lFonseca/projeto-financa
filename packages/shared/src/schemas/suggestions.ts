import { z } from "zod";
import { multiLine, singleLine, timestamp, uuid } from "./common";

/**
 * Sugestões dos usuários para o administrador. O administrador marca cada uma com um de três botões:
 *  - APPROVED (verde):  válida, aplicável. Passa para a validação (vira candidata a novidade);
 *  - REJECTED (vermelho): não válida, não aplicável. Não passa pela validação;
 *  - PENDING (branco):  ainda não decidida / em análise (é como toda sugestão chega, e o botão branco devolve a ela).
 */
export const suggestionStatuses = ["PENDING", "APPROVED", "REJECTED"] as const;
export const SuggestionStatus = z.enum(suggestionStatuses);
export type SuggestionStatusName = z.infer<typeof SuggestionStatus>;

/** Tamanho aceito do texto de uma sugestão. */
export const SUGGESTION_MIN = 10;
export const SUGGESTION_MAX = 1000;
/** Quantas sugestões cada pessoa pode enviar por dia (24 h), para evitar excesso. */
export const SUGGESTIONS_PER_DAY = 5;

export const createSuggestionBody = z.strictObject({
  body: multiLine(SUGGESTION_MAX).pipe(z.string().min(SUGGESTION_MIN, `Escreva pelo menos ${SUGGESTION_MIN} caracteres`)),
});

/** Como a própria pessoa vê a sua sugestão. */
export const suggestionDTO = z.object({
  id: uuid,
  body: z.string(),
  status: SuggestionStatus,
  /** Recado da equipe (opcional) ao decidir. */
  adminNote: z.string().nullable(),
  createdAt: timestamp,
  decidedAt: timestamp.nullable(),
});

export const mySuggestionsResponse = z.object({
  data: z.array(suggestionDTO),
  /** Quantas ainda dá para enviar hoje. */
  remainingToday: z.number().int().min(0),
});

/** Como o administrador vê (com quem escreveu). */
export const adminSuggestionDTO = suggestionDTO.extend({
  author: z.object({ id: uuid, name: z.string().nullable() }),
  decidedByName: z.string().nullable(),
});

export const adminSuggestionsQuery = z.object({
  status: SuggestionStatus.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const adminSuggestionsResponse = z.object({
  data: z.array(adminSuggestionDTO),
  /** Total em cada situação (para as abas do quadro). */
  counts: z.object({ PENDING: z.number().int(), APPROVED: z.number().int(), REJECTED: z.number().int() }),
});

export const decideSuggestionBody = z.strictObject({
  status: SuggestionStatus,
  note: singleLine(500).nullable().optional(),
});

export type SuggestionDTO = z.infer<typeof suggestionDTO>;
export type MySuggestionsResponse = z.infer<typeof mySuggestionsResponse>;
export type AdminSuggestionDTO = z.infer<typeof adminSuggestionDTO>;
export type AdminSuggestionsResponse = z.infer<typeof adminSuggestionsResponse>;

/** Texto de cada situação para a tela do usuário e para o quadro do administrador (cor do botão incluída). */
export const SUGGESTION_STATUS_LABEL: Record<SuggestionStatusName, { user: string; admin: string; button: string; color: "green" | "red" | "white" }> = {
  PENDING: { user: "Em análise", admin: "Em análise", button: "Em análise", color: "white" },
  APPROVED: { user: "Aprovada para validação", admin: "Válida: passa para a validação", button: "Válida", color: "green" },
  REJECTED: { user: "Não aplicável", admin: "Não válida: não passa pela validação", button: "Não válida", color: "red" },
};

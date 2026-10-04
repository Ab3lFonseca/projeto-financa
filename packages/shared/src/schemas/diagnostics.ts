import { z } from "zod";

/**
 * Relatório de erros do app (diagnóstico). Só informação técnica: sem valores financeiros, sem
 * e-mail, sem token. O servidor ainda higieniza texto livre antes de gravar no log.
 */
const contextValue = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);

export const clientLogEvent = z.object({
  /** Instante em que ocorreu (ISO 8601). */
  at: z.string().max(40),
  level: z.enum(["error", "warn"]),
  /** Origem: "js" (exceção), "promise", "render" (tela quebrada), "api" (falha de rede/servidor)... */
  source: z.string().max(40),
  message: z.string().max(500),
  stack: z.string().max(4000).optional(),
  /** Rota/tela aberta no momento. */
  screen: z.string().max(100).optional(),
  context: z.record(z.string().max(40), contextValue).optional().refine((c) => !c || Object.keys(c).length <= 12, "Contexto grande demais"),
});

export const clientErrorReportBody = z.strictObject({
  app: z.strictObject({
    version: z.string().max(20),
    platform: z.enum(["ios", "android", "web"]),
    osVersion: z.string().max(30).optional(),
  }),
  events: z.array(clientLogEvent).min(1).max(20),
});

export const clientErrorReportResponse = z.object({ accepted: z.number().int() });

export type ClientLogEvent = z.infer<typeof clientLogEvent>;
export type ClientErrorReportBody = z.infer<typeof clientErrorReportBody>;

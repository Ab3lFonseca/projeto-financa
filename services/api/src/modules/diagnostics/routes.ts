import { clientErrorReportBody, clientErrorReportResponse } from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]{10,}/gi;
const MONEY = /R\$\s?-?[\d.,]+/g;
const LONG_NUMBER = /\d{9,}/g;

/**
 * Remove de texto livre o que não deve ir para um arquivo de log: e-mails, tokens, valores em reais e
 * sequências longas de dígitos (CPF, cartão, conta). O app já não envia esses dados; isto é a segunda barreira.
 */
export function scrub(text: string): string {
  return text
    .replace(BEARER, "Bearer [token]")
    .replace(JWT, "[token]")
    .replace(EMAIL, "[email]")
    .replace(MONEY, "R$ [valor]")
    .replace(LONG_NUMBER, "[numero]");
}

/**
 * Recebe os erros capturados no aparelho (exceções, telas quebradas, falhas de rede) e os grava no
 * log do servidor (`source: "client"`), junto com os erros da API: um lugar só para investigar.
 * Exige login (evita lixo anônimo) mas NÃO exige aceite de termos: erros na tela de consentimento contam.
 */
export const diagnosticsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/client-errors",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
      schema: { tags: ["diagnostics"], body: clientErrorReportBody, response: { 200: clientErrorReportResponse } },
    },
    async (req) => {
      const { app: client, events } = req.body;
      for (const e of events) {
        const context = e.context
          ? Object.fromEntries(Object.entries(e.context).map(([k, v]) => [k, typeof v === "string" ? scrub(v) : v]))
          : undefined;
        req.log[e.level](
          {
            source: "client",
            client: { ...client, kind: e.source, screen: e.screen, at: e.at, context },
            stack: e.stack ? scrub(e.stack) : undefined,
          },
          `[app] ${scrub(e.message)}`,
        );
      }
      return { accepted: events.length };
    },
  );
};

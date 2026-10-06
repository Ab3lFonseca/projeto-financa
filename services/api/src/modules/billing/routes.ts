import { addonBody, billingDTO, checkoutBody, checkoutDTO, portalDTO } from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { accessConfigOf, loadAccess } from "../../lib/access-db";
import { Errors } from "../../lib/errors";

/** Assinatura do usuário logado: estado, pagamento, adicional e portal. Não exige aceite dos termos (a pessoa precisa conseguir assinar). */
export const billingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/", { schema: { tags: ["billing"], response: { 200: billingDTO } } }, async (req) => app.billing.state(req.user!));

  app.post(
    "/checkout",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } }, schema: { tags: ["billing"], body: checkoutBody, response: { 200: checkoutDTO } } },
    async (req) => app.billing.checkout(req.user!, req.body, req.ip),
  );

  app.post(
    "/portal",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } }, schema: { tags: ["billing"], response: { 200: portalDTO } } },
    async (req) => app.billing.portal(req.user!),
  );

  app.post(
    "/addon",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } }, schema: { tags: ["billing"], body: addonBody, response: { 200: billingDTO } } },
    async (req) => {
      await app.billing.setAddon(req.user!, req.body.enabled, req.ip);
      // A resposta já traz o acesso novo (lido do banco), sem esperar o cache de usuários expirar.
      const access = (await loadAccess(app.prisma, req.user!.id, accessConfigOf(app.config), app.clock())) ?? req.user!.access;
      return app.billing.state({ ...req.user!, access });
    },
  );
};

/**
 * Webhook do provedor de pagamento (sem login de usuário). Fica num escopo próprio que recebe o corpo **bruto** (Buffer): a assinatura do
 * provedor é calculada sobre os bytes exatos, e reserializar o JSON a invalidaria.
 */
export const billingWebhookRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(async (raw) => {
    raw.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
    raw.post(
      "/stripe",
      {
        config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
        schema: { tags: ["webhooks"], response: { 200: z.object({ ok: z.literal(true), duplicate: z.boolean() }) } },
      },
      async (req) => {
        if (!Buffer.isBuffer(req.body)) throw Errors.badRequest("Corpo inválido");
        const signature = req.headers["stripe-signature"];
        const { duplicate } = await app.billing.handleWebhook(req.body, Array.isArray(signature) ? signature[0] : signature);
        return { ok: true as const, duplicate };
      },
    );
  });
};

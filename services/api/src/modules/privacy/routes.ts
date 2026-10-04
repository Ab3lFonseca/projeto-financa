import { consentsResponse, privacyRequestDTO, setConsentBody } from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { audit } from "../../lib/audit";
import { runAs, runMutation, type Tx } from "../../lib/db";
import { tsOut } from "../../lib/dto";
import { Errors } from "../../lib/errors";
import { revokeAllConnections } from "../open-finance/service";
import { exportUserData, toJson } from "./service";

const ALL_TYPES = ["TERMS", "PRIVACY", "OPEN_FINANCE", "MARKETING"] as const;

/** Consentimento mais recente de cada tipo. */
async function currentConsents(tx: Tx, userId: string) {
  const rows = await tx.consent.findMany({ where: { userId }, orderBy: { grantedAt: "desc" } });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.type)) latest.set(r.type, r);
  return ALL_TYPES.flatMap((type) => {
    const c = latest.get(type);
    return c ? [{ type, version: c.version, grantedAt: tsOut(c.grantedAt), revokedAt: c.revokedAt ? tsOut(c.revokedAt) : null }] : [];
  });
}

/** Rotas de privacidade (LGPD). Acessíveis mesmo antes do aceite dos termos vigentes. */
export const privacyRoutes: FastifyPluginAsyncZod = async (app) => {
  const { config } = app;
  const legalVersions = { terms: config.LEGAL_TERMS_VERSION, privacy: config.LEGAL_PRIVACY_VERSION };

  app.get(
    "/consents",
    { schema: { tags: ["privacy"], response: { 200: consentsResponse } } },
    async (req) => runAs(req, async (tx, user) => ({ legalVersions, current: await currentConsents(tx, user.id) })),
  );

  // Concede ou revoga um consentimento. Termos e Privacidade só podem ser aceitos (a "revogação"
  // deles é encerrar a conta); Open Finance e Marketing podem ser retirados a qualquer momento.
  app.post(
    "/consents",
    { schema: { tags: ["privacy"], body: setConsentBody, response: { 200: consentsResponse } } },
    async (req) => {
      const b = req.body;
      const result = await runMutation(req, async (tx, user) => {
        const required = b.type === "TERMS" || b.type === "PRIVACY";
        if (required && !b.granted) {
          throw Errors.unprocessable("Para retirar este consentimento, exclua sua conta.", "CANNOT_REVOKE_REQUIRED");
        }
        if (required) {
          const expected = b.type === "TERMS" ? legalVersions.terms : legalVersions.privacy;
          if (b.version !== expected) {
            throw Errors.unprocessable("Versão do documento desatualizada", "OUTDATED_VERSION", { expectedVersion: expected });
          }
        }
        if (b.granted) {
          const active = await tx.consent.findFirst({ where: { userId: user.id, type: b.type, version: b.version, revokedAt: null } });
          if (!active) {
            await tx.consent.create({ data: { userId: user.id, type: b.type, version: b.version, grantedAt: app.clock() } });
          }
        } else {
          await tx.consent.updateMany({ where: { userId: user.id, type: b.type, revokedAt: null }, data: { revokedAt: app.clock() } });
        }
        return { legalVersions, current: await currentConsents(tx, user.id) };
      });
      app.users.invalidate(req.user!.id);
      // Retirar o consentimento de Open Finance encerra as conexões no provedor (se falhar, o job repete).
      if (b.type === "OPEN_FINANCE" && !b.granted && app.openFinance) {
        await revokeAllConnections(app.openFinance.deps, req.user!.id, { ip: req.ip });
      }
      await audit(app.prisma, config.IP_HASH_PEPPER, {
        actorId: req.user!.id,
        action: b.granted ? "consent.granted" : "consent.revoked",
        entity: "consent",
        entityId: b.type,
        ip: req.ip,
      }, req.log);
      return result;
    },
  );

  // Exportação dos dados pessoais (portabilidade). Gerada na hora e entregue direto,
  // sem gravar arquivo: nada de cópia extra dos dados para vazar.
  app.get(
    "/export",
    {
      config: { rateLimit: { max: 3, timeWindow: "1 hour" } },
      schema: { tags: ["privacy"], response: { 200: z.unknown() } },
    },
    async (req, reply) => {
      const payload = await runMutation(req, async (tx, user) => {
        const data = await exportUserData(tx, user, app.clock());
        await tx.privacyRequest.create({
          data: { userId: user.id, type: "EXPORT", status: "COMPLETED", completedAt: app.clock() },
        });
        return data;
      });
      await audit(app.prisma, config.IP_HASH_PEPPER, { actorId: req.user!.id, action: "privacy.export", ip: req.ip }, req.log);
      return reply
        .header("content-type", "application/json; charset=utf-8")
        .header("content-disposition", 'attachment; filename="meus-dados.json"')
        .header("cache-control", "no-store")
        .send(toJson(payload));
    },
  );

  app.get(
    "/requests",
    { schema: { tags: ["privacy"], response: { 200: z.object({ data: z.array(privacyRequestDTO) }) } } },
    async (req) =>
      runAs(req, async (tx, user) => {
        const rows = await tx.privacyRequest.findMany({ where: { userId: user.id }, orderBy: { requestedAt: "desc" }, take: 50 });
        return {
          data: rows.map((r) => ({
            id: r.id,
            type: r.type,
            status: r.status,
            requestedAt: tsOut(r.requestedAt),
            completedAt: r.completedAt ? tsOut(r.completedAt) : null,
          })),
        };
      }),
  );
};

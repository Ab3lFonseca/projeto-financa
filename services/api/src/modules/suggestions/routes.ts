import {
  adminSuggestionsQuery,
  adminSuggestionsResponse,
  createSuggestionBody,
  decideSuggestionBody,
  idParam,
  mySuggestionsResponse,
  suggestionDTO,
  SUGGESTIONS_PER_DAY,
  type AdminSuggestionDTO,
  type SuggestionDTO,
  type SuggestionStatusName,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { audit } from "../../lib/audit";
import { runAs } from "../../lib/db";
import { tsOut } from "../../lib/dto";
import { Errors } from "../../lib/errors";

const DAY_MS = 86_400_000;

type Row = { id: string; body: string; status: string; adminNote: string | null; createdAt: Date; decidedAt: Date | null };

const toDTO = (s: Row): SuggestionDTO => ({
  id: s.id,
  body: s.body,
  status: s.status as SuggestionStatusName,
  adminNote: s.adminNote,
  createdAt: tsOut(s.createdAt),
  decidedAt: s.decidedAt ? tsOut(s.decidedAt) : null,
});

/** Nome mostrado para o administrador: o de exibição ou, na falta, o começo do e-mail. */
const nameOf = (p: { email: string; profile: { displayName: string | null } | null } | null | undefined): string | null =>
  p ? p.profile?.displayName?.trim() || p.email.split("@")[0] || null : null;

/**
 * Sugestões do usuário logado: enviar e ver as suas (com a situação de cada uma). Quem escreve é só o servidor (dono do banco); a pessoa lê as
 * próprias sob RLS. Limite de `SUGGESTIONS_PER_DAY` por 24 h e sem repetir o mesmo texto.
 */
export const suggestionRoutes: FastifyPluginAsyncZod = async (app) => {
  const sentToday = (userId: string) => app.prisma.suggestion.count({ where: { userId, createdAt: { gte: new Date(app.clock().getTime() - DAY_MS) } } });

  app.get(
    "/",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } }, schema: { tags: ["suggestions"], response: { 200: mySuggestionsResponse } } },
    async (req) => {
      const rows = await runAs(req, (tx, user) => tx.suggestion.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }));
      return { data: rows.map(toDTO), remainingToday: Math.max(0, SUGGESTIONS_PER_DAY - (await sentToday(req.user!.id))) };
    },
  );

  app.post(
    "/",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } }, schema: { tags: ["suggestions"], body: createSuggestionBody, response: { 201: suggestionDTO } } },
    async (req, reply) => {
      const user = req.user!;
      const { body } = req.body;
      if ((await sentToday(user.id)) >= SUGGESTIONS_PER_DAY) {
        throw Errors.changeLimit(`Você já enviou ${SUGGESTIONS_PER_DAY} sugestões hoje. Volte amanhã para mandar mais.`, { limit: SUGGESTIONS_PER_DAY });
      }
      const recent = await app.prisma.suggestion.findMany({ where: { userId: user.id, createdAt: { gte: new Date(app.clock().getTime() - DAY_MS) } }, select: { body: true } });
      if (recent.some((r) => r.body.toLowerCase() === body.toLowerCase())) throw Errors.conflict("Você já enviou esta sugestão.", "SUGGESTION_DUPLICATE");
      const created = await app.prisma.suggestion.create({ data: { userId: user.id, body, createdAt: app.clock() } });
      return reply.code(201).send(toDTO(created));
    },
  );
};

/**
 * Quadro de sugestões do administrador (registrado dentro das rotas de administração, que já exigem o papel). Cada sugestão ganha um de três botões:
 * verde (válida, passa para a validação), vermelho (não válida) ou branco (em análise, o estado inicial).
 */
export const adminSuggestionRoutes: FastifyPluginAsyncZod = async (app) => {
  const config = app.config;

  app.get(
    "/",
    { schema: { tags: ["admin"], querystring: adminSuggestionsQuery, response: { 200: adminSuggestionsResponse } } },
    async (req) => {
      const { status, limit } = req.query;
      const [rows, grouped] = await Promise.all([
        app.prisma.suggestion.findMany({
          where: status ? { status } : {},
          orderBy: { createdAt: "desc" },
          take: limit,
          include: {
            user: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
            decidedBy: { select: { email: true, profile: { select: { displayName: true } } } },
          },
        }),
        app.prisma.suggestion.groupBy({ by: ["status"], _count: { _all: true } }),
      ]);
      const count = (s: SuggestionStatusName) => grouped.find((g) => g.status === s)?._count._all ?? 0;
      const data: AdminSuggestionDTO[] = rows.map((r) => ({
        ...toDTO(r),
        author: { id: r.user.id, name: nameOf(r.user) },
        decidedByName: nameOf(r.decidedBy),
      }));
      return { data, counts: { PENDING: count("PENDING"), APPROVED: count("APPROVED"), REJECTED: count("REJECTED") } };
    },
  );

  app.put(
    "/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 hour" } }, schema: { tags: ["admin"], params: idParam, body: decideSuggestionBody, response: { 200: suggestionDTO } } },
    async (req) => {
      const existing = await app.prisma.suggestion.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
      if (!existing) throw Errors.notFound("Sugestão");
      const { status, note } = req.body;
      // Branco (em análise) devolve a sugestão ao estado inicial: some quem decidiu e o recado.
      const pending = status === "PENDING";
      const updated = await app.prisma.suggestion.update({
        where: { id: existing.id },
        data: { status, adminNote: pending ? null : (note ?? null), decidedById: pending ? null : req.user!.id, decidedAt: pending ? null : app.clock() },
      });
      await audit(app.prisma, config.IP_HASH_PEPPER, { actorId: req.user!.id, action: "admin.suggestion.decided", entity: "suggestion", entityId: existing.id, ip: req.ip, metadata: { status, was: existing.status } }, req.log);
      return toDTO(updated);
    },
  );
};

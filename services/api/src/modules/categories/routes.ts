import {
  categoryDTO,
  createCategoryBody,
  deleteCategoryQuery,
  idParam,
  listCategoriesQuery,
  okResponse,
  updateCategoryBody,
  type CategoryDTO,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { runAs, runMutation, type Tx } from "../../lib/db";
import { Errors } from "../../lib/errors";

type CategoryRow = {
  id: string;
  type: "INCOME" | "EXPENSE";
  name: string;
  icon: string;
  color: string;
  parentId: string | null;
  systemKey: string | null;
  sortOrder: number;
  archivedAt: Date | null;
};

export function toCategoryDTO(c: CategoryRow): CategoryDTO {
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    icon: c.icon,
    color: c.color,
    parentId: c.parentId,
    systemKey: c.systemKey,
    sortOrder: c.sortOrder,
    archived: c.archivedAt !== null,
  };
}

/** Nome único (sem diferenciar maiúsculas) entre as categorias ativas do mesmo tipo. */
async function assertNameFree(tx: Tx, userId: string, type: "INCOME" | "EXPENSE", name: string, exceptId?: string) {
  const clash = await tx.category.findFirst({
    where: { userId, type, deletedAt: null, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw Errors.conflict("Já existe uma categoria com este nome", "CATEGORY_EXISTS");
}

export const categoryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    { schema: { tags: ["categories"], querystring: listCategoriesQuery, response: { 200: z.object({ data: z.array(categoryDTO) }) } } },
    async (req) =>
      runAs(req, async (tx, user) => {
        const rows = await tx.category.findMany({
          where: {
            userId: user.id,
            deletedAt: null,
            ...(req.query.type ? { type: req.query.type } : {}),
            ...(req.query.includeArchived ? {} : { archivedAt: null }),
          },
          orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        });
        return { data: rows.map(toCategoryDTO) };
      }),
  );

  app.post(
    "/",
    { schema: { tags: ["categories"], body: createCategoryBody, response: { 201: categoryDTO } } },
    async (req, reply) => {
      const b = req.body;
      const created = await runMutation(req, async (tx, user) => {
        if (b.parentId) {
          const parent = await tx.category.findFirst({ where: { id: b.parentId, userId: user.id, deletedAt: null } });
          if (!parent) throw Errors.unprocessable("Categoria pai não encontrada", "CATEGORY_NOT_FOUND", { field: "parentId" });
          if (parent.type !== b.type) throw Errors.unprocessable("A subcategoria deve ter o mesmo tipo da categoria pai", "CATEGORY_TYPE_MISMATCH");
          if (parent.parentId) throw Errors.unprocessable("Apenas um nível de subcategoria é permitido", "CATEGORY_DEPTH");
        }
        await assertNameFree(tx, user.id, b.type, b.name);
        const last = await tx.category.aggregate({ where: { userId: user.id, type: b.type }, _max: { sortOrder: true } });
        return tx.category.create({
          data: {
            userId: user.id,
            type: b.type,
            name: b.name,
            ...(b.icon ? { icon: b.icon } : {}),
            ...(b.color ? { color: b.color } : {}),
            parentId: b.parentId ?? null,
            sortOrder: (last._max.sortOrder ?? 0) + 10,
          },
        });
      });
      return reply.code(201).send(toCategoryDTO(created));
    },
  );

  app.put(
    "/:id",
    { schema: { tags: ["categories"], params: idParam, body: updateCategoryBody, response: { 200: categoryDTO } } },
    async (req) => {
      const b = req.body;
      const updated = await runMutation(req, async (tx, user) => {
        const current = await tx.category.findFirst({ where: { id: req.params.id, userId: user.id, deletedAt: null } });
        if (!current) throw Errors.notFound("Categoria");
        if (b.name !== undefined && b.name.toLowerCase() !== current.name.toLowerCase()) {
          await assertNameFree(tx, user.id, current.type, b.name, current.id);
        }
        return tx.category.update({
          where: { id: current.id },
          data: {
            ...(b.name !== undefined ? { name: b.name } : {}),
            ...(b.icon !== undefined ? { icon: b.icon } : {}),
            ...(b.color !== undefined ? { color: b.color } : {}),
            ...(b.sortOrder !== undefined ? { sortOrder: b.sortOrder } : {}),
            ...(b.archived !== undefined ? { archivedAt: b.archived ? (current.archivedAt ?? app.clock()) : null } : {}),
          },
        });
      });
      return toCategoryDTO(updated);
    },
  );

  // Exclusão lógica: o histórico dos lançamentos continua mostrando a categoria antiga.
  // Orçamentos da categoria somem; recorrências e lançamentos podem ser movidos (reassignTo).
  app.delete(
    "/:id",
    { schema: { tags: ["categories"], params: idParam, querystring: deleteCategoryQuery, response: { 200: okResponse } } },
    async (req) => {
      await runMutation(req, async (tx, user) => {
        const current = await tx.category.findFirst({ where: { id: req.params.id, userId: user.id, deletedAt: null } });
        if (!current) throw Errors.notFound("Categoria");

        const children = await tx.category.findMany({
          where: { userId: user.id, parentId: current.id, deletedAt: null },
          select: { id: true },
        });
        const ids = [current.id, ...children.map((c) => c.id)];

        const reassignTo = req.query.reassignTo;
        if (reassignTo) {
          if (ids.includes(reassignTo)) throw Errors.unprocessable("Escolha outra categoria de destino", "INVALID_REASSIGN");
          const target = await tx.category.findFirst({ where: { id: reassignTo, userId: user.id, deletedAt: null } });
          if (!target) throw Errors.unprocessable("Categoria de destino não encontrada", "CATEGORY_NOT_FOUND", { field: "reassignTo" });
          if (target.type !== current.type) {
            throw Errors.unprocessable("A categoria de destino deve ter o mesmo tipo", "CATEGORY_TYPE_MISMATCH", { field: "reassignTo" });
          }
          await tx.transaction.updateMany({
            where: { userId: user.id, categoryId: { in: ids } },
            data: { categoryId: reassignTo, version: { increment: 1 } },
          });
          await tx.recurringRule.updateMany({ where: { userId: user.id, categoryId: { in: ids } }, data: { categoryId: reassignTo } });
        }

        await tx.budget.deleteMany({ where: { userId: user.id, categoryId: { in: ids } } });
        await tx.category.updateMany({ where: { userId: user.id, id: { in: ids } }, data: { deletedAt: app.clock() } });
      });
      return { ok: true as const };
    },
  );
};

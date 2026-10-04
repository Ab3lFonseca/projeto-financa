import {
  idParam,
  listNotificationsQuery,
  listOf,
  notificationDTO,
  okResponse,
  unreadCountDTO,
  type NotificationDTO,
} from "@app/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { runAs, runMutation } from "../../lib/db";
import { tsOut } from "../../lib/dto";
import { Errors } from "../../lib/errors";
import { decodeCursor, encodeCursor, slicePage } from "../../lib/pagination";

const cursorShape = z.object({ t: z.string(), id: z.uuid() });

type Row = {
  id: string;
  type: NotificationDTO["type"];
  title: string;
  body: string;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
};

export function toNotificationDTO(n: Row): NotificationDTO {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: n.data && typeof n.data === "object" ? (n.data as Record<string, unknown>) : null,
    readAt: n.readAt ? tsOut(n.readAt) : null,
    createdAt: tsOut(n.createdAt),
  };
}

export const notificationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/",
    { schema: { tags: ["notifications"], querystring: listNotificationsQuery, response: { 200: listOf(notificationDTO) } } },
    async (req) =>
      runAs(req, async (tx, user) => {
        const { limit, cursor, unreadOnly } = req.query;
        const c = cursor ? decodeCursor(cursor, cursorShape) : null;
        const rows = await tx.notification.findMany({
          where: {
            userId: user.id,
            ...(unreadOnly ? { readAt: null } : {}),
            ...(c
              ? { OR: [{ createdAt: { lt: new Date(c.t) } }, { createdAt: new Date(c.t), id: { lt: c.id } }] }
              : {}),
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limit + 1,
        });
        const { items, hasMore } = slicePage(rows, limit);
        const last = items[items.length - 1];
        return {
          data: items.map(toNotificationDTO),
          page: { hasMore, nextCursor: hasMore && last ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id }) : null },
        };
      }),
  );

  app.get(
    "/unread-count",
    { schema: { tags: ["notifications"], response: { 200: unreadCountDTO } } },
    async (req) => runAs(req, async (tx, user) => ({ count: await tx.notification.count({ where: { userId: user.id, readAt: null } }) })),
  );

  app.post(
    "/read-all",
    { schema: { tags: ["notifications"], response: { 200: okResponse } } },
    async (req) => {
      await runMutation(req, (tx, user) =>
        tx.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: app.clock() } }),
      );
      return { ok: true as const };
    },
  );

  app.patch(
    "/:id/read",
    { schema: { tags: ["notifications"], params: idParam, response: { 200: notificationDTO } } },
    async (req) =>
      runMutation(req, async (tx, user) => {
        const current = await tx.notification.findFirst({ where: { id: req.params.id, userId: user.id } });
        if (!current) throw Errors.notFound("Notificação");
        const updated = current.readAt
          ? current
          : await tx.notification.update({ where: { id: current.id }, data: { readAt: app.clock() } });
        return toNotificationDTO(updated);
      }),
  );
};

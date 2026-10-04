import { z } from "zod";
import { NotificationType, PrivacyRequestStatus, PrivacyRequestType } from "../enums";
import { boolQuery, cursorQuery, timestamp, uuid } from "./common";

export const notificationDTO = z.object({
  id: uuid,
  type: NotificationType,
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()).nullable(),
  readAt: timestamp.nullable(),
  createdAt: timestamp,
});

export const listNotificationsQuery = z.object({
  unreadOnly: boolQuery.optional(),
  ...cursorQuery.shape,
});

export const unreadCountDTO = z.object({ count: z.number().int() });

export const privacyRequestDTO = z.object({
  id: uuid,
  type: PrivacyRequestType,
  status: PrivacyRequestStatus,
  requestedAt: timestamp,
  completedAt: timestamp.nullable(),
});

export type NotificationDTO = z.infer<typeof notificationDTO>;

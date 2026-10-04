import { notificationPrefs, type NotificationPrefs } from "@app/shared";
import type { OpCtx, Tx } from "../../lib/db";
import type { PushNotifier } from "./notifier";

export type NotificationTypeValue =
  | "BILL_DUE"
  | "INVOICE_DUE"
  | "BUDGET_NEAR_LIMIT"
  | "BUDGET_EXCEEDED"
  | "GOAL_PROGRESS"
  | "GOAL_ACHIEVED"
  | "TRANSACTION_SYNCED"
  | "SYNC_FAILED"
  | "SYSTEM";

export type NewNotification = {
  type: NotificationTypeValue;
  title: string;
  body: string;
  data?: Record<string, string | number | null>;
  /** Evita duplicar a mesma notificação (único por usuário). */
  dedupeKey: string;
};

const PREF_FOR: Record<NotificationTypeValue, keyof NotificationPrefs | null> = {
  BILL_DUE: "billsDue",
  INVOICE_DUE: "invoicesDue",
  BUDGET_NEAR_LIMIT: "budgets",
  BUDGET_EXCEEDED: "budgets",
  GOAL_PROGRESS: "goals",
  GOAL_ACHIEVED: "goals",
  TRANSACTION_SYNCED: "sync",
  SYNC_FAILED: "sync",
  SYSTEM: null,
};

/**
 * Grava notificações respeitando as preferências do usuário e ignorando duplicatas.
 * O push é disparado só depois do commit da transação que as criou.
 * Retorna quantas foram realmente criadas.
 */
export async function createNotifications(
  tx: Tx,
  userId: string,
  items: NewNotification[],
  ctx: OpCtx,
  notifier: PushNotifier,
): Promise<number> {
  if (items.length === 0) return 0;
  const profile = await tx.profile.findUnique({ where: { userId }, select: { notificationPrefs: true } });
  const prefs = notificationPrefs.parse(profile?.notificationPrefs ?? {});
  const allowed = items.filter((i) => {
    const key = PREF_FOR[i.type];
    return key === null || prefs[key];
  });
  if (allowed.length === 0) return 0;

  const created = await tx.notification.createManyAndReturn({
    data: allowed.map((i) => ({
      userId,
      type: i.type,
      title: i.title,
      body: i.body,
      data: i.data ?? undefined,
      dedupeKey: i.dedupeKey,
    })),
    skipDuplicates: true,
  });

  if (created.length > 0) {
    ctx.afterCommit(() =>
      notifier.send(
        userId,
        created.map((c) => ({
          title: c.title,
          body: c.body,
          data: { notificationId: c.id, type: c.type, ...((c.data as Record<string, unknown> | null) ?? {}) },
        })),
      ),
    );
  }
  return created.length;
}

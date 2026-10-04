import type { PrismaClient } from "@app/database";
import type { FastifyBaseLogger } from "fastify";

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

/** Porta de envio de push. Hoje: Expo Push; trocável por FCM/APNs diretos. */
export interface PushNotifier {
  send(userId: string, messages: PushMessage[]): Promise<void>;
}

export class NoopNotifier implements PushNotifier {
  async send(): Promise<void> {}
}

type ExpoTicket = { status: "ok" | "error"; details?: { error?: string } };

/**
 * Envia pelo serviço de push da Expo. Tokens inválidos (DeviceNotRegistered) são removidos.
 * Falhas de envio nunca derrubam a operação de negócio (chamado após o commit).
 */
export class ExpoPushNotifier implements PushNotifier {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly log: FastifyBaseLogger,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(userId: string, messages: PushMessage[]): Promise<void> {
    if (messages.length === 0) return;
    const tokens = await this.prisma.pushToken.findMany({ where: { userId }, select: { expoToken: true } });
    if (tokens.length === 0) return;

    const payload = tokens.flatMap((t) =>
      messages.map((m) => ({ to: t.expoToken, title: m.title, body: m.body, data: m.data ?? {}, sound: "default" })),
    );
    try {
      const res = await this.fetchFn("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        this.log.warn({ status: res.status }, "serviço de push respondeu com erro");
        return;
      }
      const json = (await res.json()) as { data?: ExpoTicket[] };
      const dead: string[] = [];
      (json.data ?? []).forEach((ticket, i) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          const to = payload[i]?.to;
          if (to) dead.push(to);
        }
      });
      if (dead.length > 0) await this.prisma.pushToken.deleteMany({ where: { expoToken: { in: dead } } });
    } catch (err) {
      this.log.warn({ err }, "falha ao enviar push");
    }
  }
}

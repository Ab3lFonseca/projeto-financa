import { Prisma, type PrismaClient } from "@app/database";
import type { BillingDTO } from "@app/shared";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../../config";
import { toAccessDTO } from "../../lib/access";
import { audit } from "../../lib/audit";
import { Errors } from "../../lib/errors";
import type { AuthUser } from "../../types";
import type { UserDirectory } from "../users/directory";
import { BillingProviderError, EMPTY_CATALOG, type BillingCatalog, type BillingInterval, type BillingProvider, type NormalizedSubscription } from "./provider";

const DAY_MS = 86_400_000;
/** Duração do "período pago" do provedor de desenvolvimento (que não cobra nada). */
const DEV_PERIOD_DAYS: Record<BillingInterval, number> = { month: 30, year: 365 };

/** Ciclo guardado no banco (texto) como o tipo do servidor; qualquer outro valor vira "não sei". */
export const asInterval = (value: string | null | undefined): BillingInterval | null => (value === "month" || value === "year" ? value : null);

type Deps = {
  prisma: PrismaClient;
  config: Config;
  provider: BillingProvider | null;
  users: UserDirectory;
  now: () => Date;
  log: FastifyBaseLogger;
};

/** Regras de cobrança: estado da assinatura, pagamento, adicional, webhooks e cortesias. Os dados de pagamento ficam sempre no provedor. */
export class BillingService {
  constructor(private readonly deps: Deps) {}

  get provider(): BillingProvider | null {
    return this.deps.provider;
  }

  private requireProvider(): BillingProvider {
    if (!this.deps.provider) throw Errors.unavailable("A assinatura ainda não está disponível.", "BILLING_UNAVAILABLE");
    return this.deps.provider;
  }

  private viaProvider<T>(fn: () => Promise<T>): Promise<T> {
    return fn().catch((err) => {
      if (err instanceof BillingProviderError) {
        this.deps.log.warn({ code: err.code, status: err.status }, "falha no provedor de pagamento");
        throw Errors.upstream("Não foi possível falar com o provedor de pagamento agora. Tente novamente em instantes.", "BILLING_PROVIDER_ERROR");
      }
      throw err;
    });
  }

  private async subscriptionOf(userId: string) {
    return this.deps.prisma.subscription.findUnique({ where: { userId } });
  }

  // ------------------------------------------------------------------------------------------------ estado

  async state(user: AuthUser): Promise<BillingDTO> {
    const { provider, config } = this.deps;
    const sub = await this.subscriptionOf(user.id);
    let prices: BillingCatalog = EMPTY_CATALOG;
    if (provider) {
      try {
        prices = await provider.catalog();
      } catch (err) {
        // Preço indisponível não derruba a tela: o app mostra o botão sem o valor e o servidor registra o motivo.
        this.deps.log.warn({ code: err instanceof BillingProviderError ? err.code : "UNKNOWN" }, "não foi possível ler os preços do provedor");
      }
    }
    return {
      access: toAccessDTO(user.access),
      enforced: config.BILLING_ENFORCED,
      trialDays: config.TRIAL_DAYS,
      provider: provider?.name ?? "none",
      checkoutAvailable: provider !== null,
      investmentsAvailable: provider?.supportsInvestments ?? false,
      canManage: provider?.name === "stripe" && Boolean(sub?.providerCustomerId),
      hasInvestmentsAddon: user.access.state === "paid" && user.access.features.investments,
      // Só mostra o ciclo de quem paga pelo app (teste, cortesia e administrador não têm).
      interval: user.access.state === "paid" && sub?.store === "WEB" ? asInterval(sub.billingInterval) : null,
      prices,
    };
  }

  // ------------------------------------------------------------------------------------------------ pagamento

  /** Abre o pagamento no provedor (ou, só em desenvolvimento, ativa a assinatura na hora). */
  async checkout(user: AuthUser, body: { investments: boolean; interval: BillingInterval }, ip: string): Promise<{ url: string | null; activated: boolean }> {
    const provider = this.requireProvider();
    const { config, prisma, now } = this.deps;
    if (!config.BILLING_ENFORCED) throw Errors.conflict("A cobrança ainda não começou: por enquanto o app é gratuito para todos.", "BILLING_NOT_ENFORCED");
    if (user.access.state === "paid" || user.access.state === "complimentary" || user.access.state === "admin") {
      throw Errors.conflict("Você já tem acesso. Para trocar o cartão ou cancelar, use o gerenciamento da assinatura.", "ALREADY_ACTIVE");
    }
    // O ciclo (e o adicional nele) precisam ter preço no provedor: nunca abre um pagamento para um plano que não existe.
    const catalog = await this.viaProvider(() => provider.catalog());
    if (!catalog.basic[body.interval]) throw Errors.unprocessable("Este plano ainda não está disponível. Escolha outra opção.", "INTERVAL_UNAVAILABLE");
    if (body.investments && !catalog.investments[body.interval]) throw Errors.unprocessable("O adicional Rendimentos ainda não está disponível para contratar neste plano.", "ADDON_UNAVAILABLE");

    await audit(prisma, config.IP_HASH_PEPPER, { actorId: user.id, action: "billing.checkout.started", entity: "user", entityId: user.id, ip, metadata: { investments: body.investments, interval: body.interval, provider: provider.name } }, this.deps.log);

    if (provider.name === "dev") {
      const end = new Date(now().getTime() + DEV_PERIOD_DAYS[body.interval] * DAY_MS);
      await this.writeSubscription(user.id, {
        status: "ACTIVE",
        store: "WEB",
        externalId: `dev_${user.id}`,
        providerCustomerId: `dev_${user.id}`,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: false,
        billingInterval: body.interval,
        investmentsAddon: body.investments,
      });
      return { url: null, activated: true };
    }

    const sub = await this.subscriptionOf(user.id);
    const base = config.APP_WEB_URL!.replace(/\/+$/, "");
    const session = await this.viaProvider(() =>
      provider.createCheckout({
        userId: user.id,
        email: user.email,
        customerId: sub?.providerCustomerId ?? null,
        interval: body.interval,
        investments: body.investments,
        successUrl: `${base}/subscription/return?status=success`,
        cancelUrl: `${base}/subscription/return?status=cancel`,
      }),
    );
    return { url: session.url, activated: false };
  }

  /** Portal do provedor: trocar cartão, ver faturas, cancelar. */
  async portal(user: AuthUser): Promise<{ url: string }> {
    const provider = this.requireProvider();
    const sub = await this.subscriptionOf(user.id);
    if (provider.name !== "stripe" || !sub?.providerCustomerId) throw Errors.conflict("Você ainda não tem uma assinatura para gerenciar.", "NO_SUBSCRIPTION");
    const returnUrl = `${this.deps.config.APP_WEB_URL!.replace(/\/+$/, "")}/subscription`;
    return this.viaProvider(() => provider.createPortal({ customerId: sub.providerCustomerId!, returnUrl }));
  }

  /** Liga ou desliga o adicional Rendimentos numa assinatura paga que já existe. */
  async setAddon(user: AuthUser, enabled: boolean, ip: string): Promise<void> {
    const provider = this.requireProvider();
    const sub = await this.subscriptionOf(user.id);
    if (user.access.state !== "paid" || !sub || sub.store !== "WEB") throw Errors.conflict("O adicional se contrata em cima de uma assinatura paga ativa.", "NO_PAID_SUBSCRIPTION");
    if (!provider.supportsInvestments) throw Errors.unprocessable("O adicional Rendimentos ainda não está disponível para contratar.", "ADDON_UNAVAILABLE");

    if (provider.name === "dev") {
      await this.writeSubscription(user.id, { status: "ACTIVE", store: "WEB", externalId: sub.externalId, providerCustomerId: sub.providerCustomerId, currentPeriodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, billingInterval: asInterval(sub.billingInterval), investmentsAddon: enabled });
    } else {
      if (!sub.externalId) throw Errors.conflict("Assinatura sem vínculo com o provedor.", "NO_PAID_SUBSCRIPTION");
      const externalId = sub.externalId;
      const current = await this.viaProvider(() => provider.fetchSubscription(externalId));
      // O adicional segue o ciclo da assinatura (o provedor exige o mesmo ciclo em todos os itens). Sem ciclo mensal/anual simples, não dá.
      const interval = current.interval;
      if (!interval) throw Errors.unprocessable("O adicional não está disponível para o ciclo desta assinatura.", "ADDON_UNAVAILABLE");
      if (enabled && !(await this.viaProvider(() => provider.catalog())).investments[interval]) {
        throw Errors.unprocessable("O adicional Rendimentos ainda não está disponível para contratar neste plano.", "ADDON_UNAVAILABLE");
      }
      await this.viaProvider(() => provider.setInvestmentsAddon({ subscriptionId: externalId, itemId: current.investmentsItemId, enabled, interval }));
      // Relê o estado real e grava: a tela já mostra o resultado, sem esperar o webhook.
      await this.apply(await this.viaProvider(() => provider.fetchSubscription(externalId)), user.id);
    }
    await audit(this.deps.prisma, this.deps.config.IP_HASH_PEPPER, { actorId: user.id, action: enabled ? "billing.addon.enabled" : "billing.addon.disabled", entity: "user", entityId: user.id, ip, metadata: { addon: "investments" } }, this.deps.log);
  }

  // ------------------------------------------------------------------------------------------------ webhooks

  /**
   * Webhook do provedor. Confere a assinatura, ignora eventos repetidos (idempotência) e relê a assinatura na API do provedor: o estado
   * gravado é sempre o atual, mesmo se os eventos chegarem fora de ordem. Se o processamento falhar, o evento é "esquecido" para o
   * provedor reenviar.
   */
  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ duplicate: boolean }> {
    const provider = this.requireProvider();
    const { prisma } = this.deps;
    let parsed;
    try {
      parsed = provider.verifyWebhook(rawBody, signature, this.deps.now().getTime());
    } catch (err) {
      if (err instanceof BillingProviderError) throw Errors.unauthorized("Webhook não autorizado", "WEBHOOK_UNAUTHORIZED");
      throw err;
    }

    let eventRowId: string;
    try {
      const row = await prisma.billingEvent.create({ data: { provider: provider.name, eventId: parsed.id.slice(0, 128), eventType: parsed.type.slice(0, 80) }, select: { id: true } });
      eventRowId = row.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { duplicate: true };
      throw err;
    }

    try {
      if (parsed.subscriptionId) {
        const subscriptionId = parsed.subscriptionId;
        const normalized = await this.viaProvider(() => provider.fetchSubscription(subscriptionId));
        await this.apply(normalized, parsed.userId);
      }
      await prisma.billingEvent.update({ where: { id: eventRowId }, data: { processedAt: this.deps.now() } });
    } catch (err) {
      await prisma.billingEvent.delete({ where: { id: eventRowId } }).catch(() => undefined);
      throw err;
    }
    return { duplicate: false };
  }

  /** Grava no banco o estado atual da assinatura lido do provedor. */
  async apply(sub: NormalizedSubscription, userIdHint: string | null): Promise<void> {
    const { prisma, log } = this.deps;
    if (sub.status === "INCOMPLETE") return; // pagamento ainda não concluído: não dá acesso nem apaga o que já existe

    let userId = sub.userId ?? userIdHint;
    if (!userId) {
      const known = await prisma.subscription.findFirst({
        where: { OR: [{ store: "WEB", externalId: sub.providerSubscriptionId }, { providerCustomerId: sub.providerCustomerId }] },
        select: { userId: true },
      });
      userId = known?.userId ?? null;
    }
    if (!userId) {
      log.warn("assinatura do provedor sem usuário conhecido; ignorada");
      return;
    }
    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) {
      log.warn("assinatura de usuário que não existe mais; ignorada");
      return;
    }

    await this.writeSubscription(userId, {
      status: sub.status,
      store: "WEB",
      externalId: sub.providerSubscriptionId,
      providerCustomerId: sub.providerCustomerId,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      billingInterval: sub.interval,
      investmentsAddon: sub.investmentsAddon,
    });
    await audit(prisma, this.deps.config.IP_HASH_PEPPER, {
      action: "billing.subscription.synced",
      entity: "user",
      entityId: userId,
      metadata: { status: sub.status, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, addon: sub.investmentsAddon, interval: sub.interval },
    }, log);
  }

  private async writeSubscription(
    userId: string,
    s: { status: NormalizedSubscription["status"]; store: "WEB" | "MANUAL"; externalId: string | null; providerCustomerId: string | null; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; billingInterval: BillingInterval | null; investmentsAddon: boolean },
  ): Promise<void> {
    const status = s.status === "INCOMPLETE" ? "EXPIRED" : s.status;
    const data = {
      plan: "PREMIUM" as const,
      status,
      store: s.store,
      externalId: s.externalId,
      providerCustomerId: s.providerCustomerId,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      billingInterval: s.billingInterval,
      investmentsAddon: s.investmentsAddon,
      canceledAt: status === "CANCELED" ? this.deps.now() : null,
    };
    await this.deps.prisma.subscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    this.deps.users.invalidate(userId);
  }

  // ------------------------------------------------------------------------------------------------ exclusão de conta

  /**
   * Chamado antes de apagar a conta: apaga o cliente no provedor, o que cancela na hora qualquer assinatura e remove e-mail e cartão salvos de
   * lá. Sem isso a cobrança continuaria depois que a conta some. Se o provedor falhar, lança: a exclusão fica pela metade e o job a retoma.
   */
  async eraseCustomer(userId: string): Promise<void> {
    const { provider, prisma, log } = this.deps;
    const sub = await prisma.subscription.findUnique({ where: { userId }, select: { providerCustomerId: true } });
    const customerId = sub?.providerCustomerId;
    if (!customerId) return;
    if (!provider) {
      // Sem provedor configurado não há como cancelar; travar a exclusão para sempre seria pior (direito de eliminação, LGPD art. 18, VI).
      log.error("conta com cliente no provedor de pagamento sendo excluída, mas nenhum provedor está configurado: cancele a assinatura manualmente");
      return;
    }
    await this.viaProvider(() => provider.deleteCustomer(customerId));
  }

  // ------------------------------------------------------------------------------------------------ cortesia (administrador)

  /** Concede acesso sem pagar. `days: null` = sem data de fim. Recusa quem já tem assinatura paga ativa (para não apagar o vínculo com o provedor). */
  async grantComplimentary(adminId: string, targetId: string, input: { days: number | null; investments: boolean }, ip: string): Promise<void> {
    const { prisma, now, config } = this.deps;
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, subscription: { select: { store: true, status: true, plan: true, currentPeriodEnd: true, providerCustomerId: true } } } });
    if (!target) throw Errors.notFound("Usuário");
    const s = target.subscription;
    const paidActive = s && s.plan === "PREMIUM" && s.store !== "MANUAL" && (s.status === "ACTIVE" || s.status === "TRIALING" || s.status === "PAST_DUE") && (!s.currentPeriodEnd || s.currentPeriodEnd > now());
    if (paidActive) throw Errors.conflict("Esta pessoa já tem uma assinatura paga ativa.", "ALREADY_PAID");

    const end = input.days === null ? null : new Date(now().getTime() + input.days * DAY_MS);
    // Mantém o cliente do provedor (se a pessoa já pagou antes, o portal continua abrindo com o cartão salvo).
    await this.writeSubscription(targetId, { status: "ACTIVE", store: "MANUAL", externalId: null, providerCustomerId: s?.providerCustomerId ?? null, currentPeriodEnd: end, cancelAtPeriodEnd: false, billingInterval: null, investmentsAddon: input.investments });
    await audit(prisma, config.IP_HASH_PEPPER, { actorId: adminId, action: "admin.access.granted", entity: "user", entityId: targetId, ip, metadata: { days: input.days, investments: input.investments } }, this.deps.log);
  }

  /** Remove a cortesia. Só vale para cortesias: uma assinatura paga se cancela no portal do provedor. */
  async revokeComplimentary(adminId: string, targetId: string, ip: string): Promise<void> {
    const { prisma, now, config } = this.deps;
    const sub = await this.subscriptionOf(targetId);
    if (!sub || sub.store !== "MANUAL" || sub.plan !== "PREMIUM") throw Errors.conflict("Esta pessoa não tem cortesia para remover.", "NOT_COMPLIMENTARY");
    await prisma.subscription.update({ where: { userId: targetId }, data: { plan: "FREE", status: "CANCELED", currentPeriodEnd: now(), canceledAt: now(), investmentsAddon: false, cancelAtPeriodEnd: false } });
    this.deps.users.invalidate(targetId);
    await audit(prisma, config.IP_HASH_PEPPER, { actorId: adminId, action: "admin.access.revoked", entity: "user", entityId: targetId, ip }, this.deps.log);
  }
}

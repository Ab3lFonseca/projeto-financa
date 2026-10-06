import { describe, expect, it } from "vitest";
import { daysUntil, planOf, resolveAccess, toAccessDTO, trialEnd, type AccessConfig, type SubscriptionInfo } from "../src/lib/access";

const DAY = 86_400_000;
const created = new Date("2026-09-01T12:00:00.000Z");
const at = (days: number) => new Date(created.getTime() + days * DAY);
const config: AccessConfig = { billingEnforced: true, trialDays: 30, billingStartsAt: null };

const sub = (over: Partial<NonNullable<SubscriptionInfo>> = {}): SubscriptionInfo => ({
  plan: "PREMIUM",
  status: "ACTIVE",
  store: "WEB",
  currentPeriodEnd: at(60),
  trialEndsAt: null,
  cancelAtPeriodEnd: false,
  investmentsAddon: false,
  ...over,
});

const access = (over: { role?: "USER" | "ADMIN"; subscription?: SubscriptionInfo; now: Date; config?: Partial<AccessConfig> }) =>
  resolveAccess({ role: over.role ?? "USER", createdAt: created, subscription: over.subscription ?? null, config: { ...config, ...over.config }, now: over.now });

describe("cobrança desligada (beta)", () => {
  it("todos liberados, com tudo, sem data de fim", () => {
    const a = access({ now: at(400), config: { billingEnforced: false } });
    expect(a).toMatchObject({ state: "beta", allowed: true, expiresAt: null, daysLeft: null, features: { investments: true } });
  });
});

describe("administrador", () => {
  it("sempre liberado e com tudo, mesmo passado o teste e sem assinatura", () => {
    const a = access({ role: "ADMIN", now: at(999) });
    expect(a).toMatchObject({ state: "admin", allowed: true, features: { investments: true } });
  });
});

describe("teste grátis", () => {
  it("vale 30 dias a partir do cadastro, com tudo liberado (inclusive o Rendimentos)", () => {
    const first = access({ now: at(0) });
    expect(first).toMatchObject({ state: "trial", allowed: true, daysLeft: 30, features: { investments: true } });
    expect(first.expiresAt?.toISOString()).toBe(at(30).toISOString());
    expect(access({ now: at(29.5) })).toMatchObject({ state: "trial", daysLeft: 1 });
  });

  it("acaba exatamente no 30º dia: depois disso, somente leitura", () => {
    expect(access({ now: new Date(at(30).getTime() - 1) }).state).toBe("trial");
    const over = access({ now: at(30) });
    expect(over).toMatchObject({ state: "expired", allowed: false, expiresAt: null, daysLeft: null, features: { investments: false } });
  });

  it("a prorrogação gravada pelo suporte (trialEndsAt) vale no lugar do cálculo", () => {
    const extended = sub({ plan: "FREE", status: "ACTIVE", store: "MANUAL", trialEndsAt: at(45), currentPeriodEnd: null });
    expect(access({ subscription: extended, now: at(40) })).toMatchObject({ state: "trial", daysLeft: 5 });
    expect(access({ subscription: extended, now: at(46) }).state).toBe("expired");
    // ...e também pode encurtar.
    expect(access({ subscription: sub({ plan: "FREE", trialEndsAt: at(10) }), now: at(11) }).state).toBe("expired");
  });

  it("contas antigas: com BILLING_STARTS_AT o teste começa na data de início da cobrança, não no cadastro", () => {
    const startsAt = at(100);
    const cfg = { billingStartsAt: startsAt };
    expect(access({ now: at(100), config: cfg })).toMatchObject({ state: "trial", daysLeft: 30 });
    expect(access({ now: at(101), config: cfg })).toMatchObject({ state: "trial", daysLeft: 29 });
    expect(access({ now: at(129), config: cfg }).state).toBe("trial");
    expect(access({ now: at(130), config: cfg }).state).toBe("expired");
    // Quem se cadastra depois do início começa no próprio cadastro.
    expect(trialEnd(at(200), null, { trialDays: 30, ...cfg }).toISOString()).toBe(at(230).toISOString());
    // Início anterior ao cadastro é ignorado.
    expect(trialEnd(created, null, { trialDays: 30, billingStartsAt: at(-50) }).toISOString()).toBe(at(30).toISOString());
  });

  it("TRIAL_DAYS configurável", () => {
    expect(access({ now: at(6), config: { trialDays: 7 } })).toMatchObject({ state: "trial", daysLeft: 1 });
    expect(access({ now: at(7), config: { trialDays: 7 } }).state).toBe("expired");
    expect(access({ now: at(6), config: { trialDays: 14 } })).toMatchObject({ state: "trial", daysLeft: 8 });
  });
});

describe("assinatura paga", () => {
  it("em dia: liberada até o fim do período; o Rendimentos só se foi contratado", () => {
    const base = access({ subscription: sub(), now: at(40) });
    expect(base).toMatchObject({ state: "paid", allowed: true, features: { investments: false } });
    expect(base.expiresAt?.toISOString()).toBe(at(60).toISOString());
    expect(access({ subscription: sub({ investmentsAddon: true }), now: at(40) }).features.investments).toBe(true);
  });

  it("depois do teste, quem assina o básico mantém o acesso mas NÃO ganha o Rendimentos de graça", () => {
    expect(access({ subscription: sub(), now: at(31) })).toMatchObject({ state: "paid", features: { investments: false } });
  });

  it("período vencido sem renovação: volta ao teste (se ainda valer) ou ao somente leitura", () => {
    const old = sub({ currentPeriodEnd: at(20) });
    expect(access({ subscription: old, now: at(21) }).state).toBe("trial");
    expect(access({ subscription: old, now: at(35) }).state).toBe("expired");
  });

  it("cartão recusado (PAST_DUE) mantém o acesso até o fim do período já pago, e só até lá", () => {
    const failing = sub({ status: "PAST_DUE", currentPeriodEnd: at(50) });
    expect(access({ subscription: failing, now: at(49) }).state).toBe("paid");
    expect(access({ subscription: failing, now: at(51) }).state).toBe("expired");
  });

  it("cancelada: acaba na hora; cancelamento agendado vale até o fim do período e avisa o app", () => {
    expect(access({ subscription: sub({ status: "CANCELED" }), now: at(40) }).state).toBe("expired");
    expect(access({ subscription: sub({ cancelAtPeriodEnd: true }), now: at(40) })).toMatchObject({ state: "paid", cancelAtPeriodEnd: true });
  });

  it("linha FREE (sem assinatura) não dá acesso", () => {
    expect(access({ subscription: sub({ plan: "FREE" }), now: at(40) }).state).toBe("expired");
  });
});

describe("cortesia (concedida pela equipe)", () => {
  it("sem data de fim vale para sempre; com data vale até ela", () => {
    const forever = sub({ store: "MANUAL", currentPeriodEnd: null });
    expect(access({ subscription: forever, now: at(2000) })).toMatchObject({ state: "complimentary", allowed: true, expiresAt: null, daysLeft: null });
    const until = sub({ store: "MANUAL", currentPeriodEnd: at(90) });
    expect(access({ subscription: until, now: at(80) })).toMatchObject({ state: "complimentary", daysLeft: 10 });
    expect(access({ subscription: until, now: at(91) }).state).toBe("expired");
  });

  it("quem concede escolhe se inclui o Rendimentos", () => {
    expect(access({ subscription: sub({ store: "MANUAL", currentPeriodEnd: null }), now: at(50) }).features.investments).toBe(false);
    expect(access({ subscription: sub({ store: "MANUAL", currentPeriodEnd: null, investmentsAddon: true }), now: at(50) }).features.investments).toBe(true);
  });
});

describe("derivados", () => {
  it("o plano do servidor segue o acesso: Premium enquanto liberado, Free no somente leitura", () => {
    expect(planOf(access({ now: at(1) }))).toBe("PREMIUM");
    expect(planOf(access({ now: at(99) }))).toBe("FREE");
  });

  it("daysUntil arredonda para cima e nunca fica negativo", () => {
    expect(daysUntil(new Date(1000 + 2 * DAY + 5), new Date(1000))).toBe(3);
    expect(daysUntil(new Date(1000), new Date(5000))).toBe(0);
  });

  it("a versão enviada ao app leva datas em texto e não expõe nada além do acesso", () => {
    const dto = toAccessDTO(access({ now: at(1) }));
    expect(Object.keys(dto).sort()).toEqual(["allowed", "cancelAtPeriodEnd", "daysLeft", "expiresAt", "features", "state"]);
    expect(typeof dto.expiresAt).toBe("string");
  });
});

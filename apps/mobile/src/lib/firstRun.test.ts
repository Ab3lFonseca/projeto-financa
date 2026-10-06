import { describe, expect, it } from "vitest";
import type { Me } from "./api/endpoints";
import { nextFirstRunStep } from "./firstRun";

const base = {
  consentRequired: false,
  security: { mfaEnabled: false, promptAnswered: false, hasPassword: true },
  notices: { trialIntroSeen: false },
  entitlements: { billingEnforced: true, access: { state: "trial", allowed: true, expiresAt: null, daysLeft: 30, cancelAtPeriodEnd: false, features: { investments: true } } },
};
const me = (over: Record<string, unknown> = {}) => ({ ...base, ...over }) as unknown as Me;

describe("avisos de primeiro acesso", () => {
  it("primeiro a pergunta da verificação em duas etapas, depois o aviso do teste grátis", () => {
    expect(nextFirstRunStep(me())).toBe("security");
    expect(nextFirstRunStep(me({ security: { ...base.security, promptAnswered: true } }))).toBe("trial");
    expect(nextFirstRunStep(me({ security: { ...base.security, promptAnswered: true }, notices: { trialIntroSeen: true } }))).toBeNull();
  });

  it("o que a pessoa acabou de fechar some na hora, sem esperar o servidor", () => {
    expect(nextFirstRunStep(me(), new Set(["security"]))).toBe("trial");
    expect(nextFirstRunStep(me(), new Set(["security", "trial"]))).toBeNull();
  });

  it("não pergunta de novo a quem já ligou a verificação", () => {
    expect(nextFirstRunStep(me({ security: { ...base.security, mfaEnabled: true } }))).toBe("trial");
  });

  it("o aviso do teste só aparece com a cobrança ligada e durante o teste (nunca no beta, para assinante, cortesia ou administrador)", () => {
    const ent = (over: Record<string, unknown>, state = "trial") => ({ billingEnforced: true, access: { ...base.entitlements.access, state }, ...over });
    const answered = { security: { ...base.security, promptAnswered: true } };
    expect(nextFirstRunStep(me({ ...answered, entitlements: ent({ billingEnforced: false }, "beta") }))).toBeNull();
    for (const state of ["paid", "complimentary", "admin", "expired"]) expect(nextFirstRunStep(me({ ...answered, entitlements: ent({}, state) })), state).toBeNull();
  });

  it("espera os Termos serem aceitos e tolera um servidor mais antigo (sem os campos novos)", () => {
    expect(nextFirstRunStep(me({ consentRequired: true }))).toBeNull();
    expect(nextFirstRunStep(null)).toBeNull();
    expect(nextFirstRunStep(me({ security: undefined, notices: undefined }))).toBeNull();
  });
});

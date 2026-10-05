import { beforeEach, describe, expect, it } from "vitest";
import { padRect, placeCard, sameRect, type Rect } from "./geometry";
import { isMainPath, TOUR_STEPS } from "./steps";
import { useTourStore } from "./store";

describe("etapas do tutorial", () => {
  it("cada etapa tem título, explicação, utilidade, ícone e uma tela válida", () => {
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(6);
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(12); // não sobrecarrega
    for (const s of TOUR_STEPS) {
      expect(s.title.length, s.id).toBeGreaterThan(5);
      expect(s.body.length, s.id).toBeGreaterThan(40);
      expect(s.why.length, s.id).toBeGreaterThan(20);
      expect(s.icon, s.id).toMatch(/^[a-z0-9-]+$/);
      expect(isMainPath(s.route), `${s.id}: ${s.route}`).toBe(true);
    }
  });

  it("ids únicos; a abertura é centralizada (sem alvo) e as demais destacam algo real", () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TOUR_STEPS[0]!.target).toBeUndefined();
    for (const s of TOUR_STEPS.slice(1)) expect(s.target, s.id).toMatch(/^[a-z]+(-[a-z]+)+$/);
  });

  it("cobre as áreas principais do app", () => {
    const targets = TOUR_STEPS.map((s) => s.target);
    for (const t of ["home-balance", "home-fab", "tx-tools", "charts-range", "wallet-tabs", "tab-investments", "more-planning", "more-bank", "more-settings"]) {
      expect(targets, t).toContain(t);
    }
  });

  it("o tutorial só começa sozinho nas abas principais", () => {
    for (const p of ["/", "/transactions", "/charts", "/wallet", "/investments", "/more", "/more/"]) expect(isMainPath(p), p).toBe(true);
    for (const p of ["/login", "/consent", "/settings", "/transaction/new", "/open-finance"]) expect(isMainPath(p), p).toBe(false);
  });
});

describe("posição do cartão de explicação", () => {
  const phone = { width: 390, height: 780 };
  const desktop = { width: 1280, height: 800 };
  const card = { height: 240 };
  const inside = (p: { top: number; left: number; width: number }, v: { width: number; height: number }) => {
    expect(p.left).toBeGreaterThanOrEqual(16);
    expect(p.left + p.width).toBeLessThanOrEqual(v.width - 16);
    expect(p.top).toBeGreaterThanOrEqual(16);
    expect(p.top + card.height).toBeLessThanOrEqual(v.height - 16);
  };

  it("sem destaque: centralizado", () => {
    const p = placeCard(null, phone, card);
    expect(p.where).toBe("center");
    expect(p.left + p.width / 2).toBeCloseTo(phone.width / 2, 0);
    inside(p, phone);
  });

  it("alvo no alto da tela: o cartão fica embaixo dele, sem cobri-lo", () => {
    const target: Rect = { x: 16, y: 80, width: 358, height: 120 };
    const p = placeCard(target, phone, card);
    expect(p.where).toBe("below");
    expect(p.top).toBeGreaterThanOrEqual(target.y + target.height);
    inside(p, phone);
  });

  it("alvo na barra de abas (embaixo): o cartão fica em cima dele", () => {
    const tab: Rect = { x: 260, y: 722, width: 65, height: 58 };
    const p = placeCard(tab, phone, card);
    expect(p.where).toBe("above");
    expect(p.top + card.height).toBeLessThanOrEqual(tab.y);
    inside(p, phone);
  });

  it("em telas estreitas o cartão ocupa a largura; em telas largas, no máximo 380", () => {
    expect(placeCard(null, phone, card).width).toBe(phone.width - 32);
    expect(placeCard(null, desktop, card).width).toBe(380);
  });

  it("o cartão nunca sai da tela, mesmo com alvo na borda direita ou esquerda", () => {
    for (const x of [0, 8, 600, 1180, 1250]) {
      const p = placeCard({ x, y: 300, width: 80, height: 50 }, desktop, card);
      inside(p, desktop);
    }
  });

  it("tela muito baixa: sem espaço em cima nem embaixo, vai para o lado oposto ao alvo (sem cobri-lo)", () => {
    const short = { width: 390, height: 360 };
    const nearTop = placeCard({ x: 20, y: 60, width: 350, height: 150 }, short, card);
    expect(nearTop.where).toBe("bottom");
    const nearBottom = placeCard({ x: 20, y: 200, width: 350, height: 140 }, short, card);
    expect(["top", "above"]).toContain(nearBottom.where);
  });

  it("padRect aumenta o destaque e recorta na tela", () => {
    expect(padRect({ x: 20, y: 20, width: 100, height: 50 }, 8, phone)).toEqual({ x: 12, y: 12, width: 116, height: 66 });
    expect(padRect({ x: 2, y: 2, width: 100, height: 50 }, 8, phone)).toEqual({ x: 0, y: 0, width: 110, height: 60 });
    const edge = padRect({ x: 350, y: 760, width: 80, height: 60 }, 8, phone);
    expect(edge.x + edge.width).toBeLessThanOrEqual(phone.width);
    expect(edge.y + edge.height).toBeLessThanOrEqual(phone.height);
  });

  it("sameRect tolera meio pixel de diferença", () => {
    const a: Rect = { x: 10, y: 10, width: 100, height: 40 };
    expect(sameRect(a, { ...a, x: 10.4 })).toBe(true);
    expect(sameRect(a, { ...a, width: 102 })).toBe(false);
    expect(sameRect(null, null)).toBe(true);
    expect(sameRect(a, null)).toBe(false);
  });
});

describe("estado do tutorial", () => {
  const s = () => useTourStore.getState();
  const last = TOUR_STEPS.length - 1;
  beforeEach(() => useTourStore.setState({ active: false, index: 0, phase: "steps", source: null, ended: null }));

  it("começa na primeira etapa, ativo, e lembra como começou", () => {
    s().start("auto");
    expect(s()).toMatchObject({ active: true, index: 0, phase: "steps", source: "auto", ended: null });
    s().start("manual");
    expect(s().source).toBe("manual");
  });

  it("avança e volta, sem passar dos limites", () => {
    s().start("manual");
    s().back();
    expect(s().index).toBe(0);
    s().next();
    s().next();
    expect(s().index).toBe(2);
    s().back();
    expect(s().index).toBe(1);
  });

  it("concluir na última etapa mostra o cartão final e já conta como concluído", () => {
    s().start("auto");
    for (let i = 0; i < last; i++) s().next();
    expect(s()).toMatchObject({ index: last, phase: "steps", ended: null });
    s().next();
    expect(s()).toMatchObject({ active: true, phase: "done", ended: "finished" });
    s().next(); // não faz nada no cartão final
    expect(s().phase).toBe("done");
    s().close();
    expect(s()).toMatchObject({ active: false, index: 0, phase: "steps" });
    expect(s().ended).toBe("finished"); // quem grava a conclusão ainda precisa ler
    s().acknowledge();
    expect(s().ended).toBeNull();
  });

  it("pular fecha na hora e conta como concluído", () => {
    s().start("auto");
    s().next();
    s().skip();
    expect(s()).toMatchObject({ active: false, ended: "skipped" });
  });

  it("não reage quando está fechado", () => {
    s().next();
    s().back();
    s().skip();
    expect(s()).toMatchObject({ active: false, index: 0, ended: null });
  });

  it("reabrir depois de concluir recomeça do zero", () => {
    s().start("auto");
    for (let i = 0; i <= last; i++) s().next();
    s().close();
    s().acknowledge();
    s().start("manual");
    expect(s()).toMatchObject({ active: true, index: 0, phase: "steps", ended: null });
  });
});

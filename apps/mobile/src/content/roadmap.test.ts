import { describe, expect, it } from "vitest";
import { isRecent, itemsByStatus, ROADMAP, ROADMAP_SECTIONS, roadmapItem } from "./roadmap";

describe("mural de novidades", () => {
  it("itens com id único, textos preenchidos e ícone válido", () => {
    expect(new Set(ROADMAP.map((i) => i.id)).size).toBe(ROADMAP.length);
    for (const i of ROADMAP) {
      expect(i.title.length, i.id).toBeGreaterThan(5);
      expect(i.summary.length, i.id).toBeGreaterThan(20);
      expect(i.icon, i.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("quem já chegou diz o dia (data válida); quem ainda não chegou não tem data (não prometemos prazo)", () => {
    for (const i of ROADMAP) {
      if (i.status === "done") {
        expect(i.since, i.id).toMatch(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
        expect(Number.isNaN(Date.parse(`${i.since}T00:00:00Z`)), i.id).toBe(false);
      } else expect(i.since, i.id).toBeUndefined();
    }
  });

  it("o que já chegou aparece do mais recente para o mais antigo, e a novidade mais recente é a primeira", () => {
    const done = itemsByStatus("done");
    const dates = done.map((i) => i.since!);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(done.length).toBeGreaterThanOrEqual(10); // o mural lista tudo o que chegou, não só um resumo
    expect(done[0]!.id).toBe("badges");
    // mesma data: mantém a ordem em que foram escritos
    const sameDay = done.filter((i) => i.since === done[0]!.since).map((i) => i.id);
    expect(sameDay).toEqual(ROADMAP.filter((i) => i.since === done[0]!.since).map((i) => i.id));
  });

  it("o selo 'Novo' vale só até 7 dias depois da chegada (e nunca para data futura ou item sem data)", () => {
    expect(isRecent("2026-10-07", "2026-10-07")).toBe(true);
    expect(isRecent("2026-10-07", "2026-10-14")).toBe(true);
    expect(isRecent("2026-10-07", "2026-10-15")).toBe(false);
    expect(isRecent("2026-10-07", "2026-10-06")).toBe(false);
    expect(isRecent(undefined, "2026-10-07")).toBe(false);
    expect(isRecent("2026-10-07", "2026-10-09", 1)).toBe(false);
  });

  it("as novidades recentes do app estão no mural (nada que a pessoa perceba fica de fora)", () => {
    const ids = new Set(ROADMAP.map((i) => i.id));
    for (const id of ["badges", "themes-families", "living-background", "two-factor", "my-account", "celebrations", "trial-notice", "support", "legal", "appearance", "tour", "motion"]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("a assinatura anual/mensal ainda não aparece como lançada (a cobrança não está aberta ao público)", () => {
    expect(roadmapItem("plans")?.status).toBe("soon");
  });

  it("a explicação (para que serve, como vai funcionar, o que esperar) vem completa", () => {
    const withPreview = ROADMAP.filter((i) => i.preview);
    expect(withPreview.length).toBeGreaterThan(0);
    for (const i of withPreview) {
      expect(i.preview!.purpose.length, i.id).toBeGreaterThan(30);
      expect(i.preview!.how.length, i.id).toBeGreaterThanOrEqual(2);
      expect(i.preview!.expect.length, i.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("não cita fornecedores nem promete data (o mural é para o público)", () => {
    const text = JSON.stringify(ROADMAP).toLowerCase();
    for (const name of ["pluggy", "belvo", "stripe", "supabase", "asaas"]) expect(text, name).not.toContain(name);
    expect(text).not.toMatch(/\b(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b.*\b20\d\d\b/);
  });

  it("o Open Finance continua 'em breve' (não está liberado) e tem a explicação completa", () => {
    const bank = roadmapItem("bank-connection");
    expect(bank?.status).toBe("soon");
    expect(bank?.preview?.how.join(" ")).toMatch(/senha/);
  });

  it("toda seção tem itens ou é omitida pela tela; os status cobrem todos os itens", () => {
    const covered = ROADMAP_SECTIONS.flatMap((s) => itemsByStatus(s.status));
    expect(covered.length).toBe(ROADMAP.length);
    expect(roadmapItem("nao-existe")).toBeUndefined();
  });
});

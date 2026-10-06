import { describe, expect, it } from "vitest";
import { itemsByStatus, ROADMAP, ROADMAP_SECTIONS, roadmapItem } from "./roadmap";

describe("mural de novidades", () => {
  it("itens com id único, textos preenchidos e ícone válido", () => {
    expect(new Set(ROADMAP.map((i) => i.id)).size).toBe(ROADMAP.length);
    for (const i of ROADMAP) {
      expect(i.title.length, i.id).toBeGreaterThan(5);
      expect(i.summary.length, i.id).toBeGreaterThan(20);
      expect(i.icon, i.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("quem já chegou diz em que mês; quem ainda não chegou não tem data (não prometemos prazo)", () => {
    for (const i of ROADMAP) {
      if (i.status === "done") expect(i.since, i.id).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      else expect(i.since, i.id).toBeUndefined();
    }
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

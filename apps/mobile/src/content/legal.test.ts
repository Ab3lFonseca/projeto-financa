import { describe, expect, it, vi } from "vitest";
import { SUPPORT } from "./contact";

// O módulo da empresa lê o expo-constants (só existe no app). Aqui vale o padrão: nome "Finança", sem CNPJ nem cidade, contato do app.
vi.mock("./company", () => ({
  COMPANY: { name: "Finança", cnpj: "", city: "", dpoEmail: "financascontact2026@gmail.com", supportEmail: "financascontact2026@gmail.com" },
}));
import { controllerLine, COMPANY, LAWS, LEGAL_DOCS, LEGAL_VERSION_LABEL, PRIVACY_POLICY, TERMS_OF_USE, type LegalDoc } from "./legal";

const allText = (doc: LegalDoc) =>
  JSON.stringify([doc.intro, doc.highlights, doc.sections.map((s) => [s.heading, s.blocks])]);

describe("documentos legais", () => {
  it("a versão acompanha a da API e aparece nos dois documentos", () => {
    expect(LEGAL_VERSION_LABEL).toBe("2026-10-07");
    for (const d of Object.values(LEGAL_DOCS)) expect(d.version).toBe(LEGAL_VERSION_LABEL);
  });

  it("estrutura: ids de tópico únicos, cada tópico tem título numerado e conteúdo, e há o resumo em 4 cartões", () => {
    for (const d of [PRIVACY_POLICY, TERMS_OF_USE]) {
      const ids = d.sections.map((s) => s.id);
      expect(new Set(ids).size, d.key).toBe(ids.length);
      expect(d.sections.length, d.key).toBeGreaterThanOrEqual(13);
      d.sections.forEach((s, i) => {
        expect(s.heading, `${d.key}:${s.id}`).toMatch(new RegExp(`^${i + 1}\\. `)); // numeração contínua
        expect(s.blocks.length, s.id).toBeGreaterThan(0);
        expect(s.icon, s.id).toMatch(/^[a-z0-9-]+$/);
      });
      expect(d.highlights).toHaveLength(4);
      expect(d.intro.length).toBeGreaterThan(80);
    }
  });

  it("tabelas bem formadas: toda linha tem o mesmo número de colunas do cabeçalho; listas e parágrafos não vêm vazios", () => {
    for (const d of [PRIVACY_POLICY, TERMS_OF_USE]) {
      for (const s of d.sections) {
        for (const b of s.blocks) {
          if (b.kind === "table") {
            expect(b.head.length).toBeGreaterThanOrEqual(2);
            for (const row of b.rows) expect(row.length, `${d.key}:${s.id}`).toBe(b.head.length);
          }
          if (b.kind === "list") expect(b.items.length).toBeGreaterThan(0);
          if (b.kind === "p" || b.kind === "note") expect(b.text.trim().length).toBeGreaterThan(10);
        }
      }
    }
  });

  it("não deixa marcadores de preenchimento na tela ([CNPJ], [NOME DA EMPRESA]...)", () => {
    for (const d of [PRIVACY_POLICY, TERMS_OF_USE]) {
      expect(allText(d)).not.toMatch(/\[[A-ZÀ-Ú /]{3,}\]/);
      expect(allText(d)).not.toContain("undefined");
      expect(allText(d)).not.toContain("null");
    }
    expect(controllerLine({ name: "Finança", cnpj: "", city: "" })).toBe("Finança");
    expect(controllerLine({ name: "Finança Ltda", cnpj: "00.000.000/0001-00", city: "Joinville/SC" })).toBe("Finança Ltda, CNPJ 00.000.000/0001-00, com sede em Joinville/SC");
  });

  it("o canal do encarregado e do suporte é o contato informado (e-mail e WhatsApp)", () => {
    expect(COMPANY.supportEmail).toBe(SUPPORT.email);
    expect(COMPANY.dpoEmail).toBe(SUPPORT.email);
    expect(allText(PRIVACY_POLICY)).toContain(SUPPORT.email);
    expect(allText(PRIVACY_POLICY)).toContain(SUPPORT.whatsappDisplay);
    expect(allText(TERMS_OF_USE)).toContain(SUPPORT.email);
  });

  it("a Política cobre o que o app realmente faz: bases legais, direitos, login social, 2FA, pagamentos, transferência internacional e prazos", () => {
    const t = allText(PRIVACY_POLICY);
    for (const needle of ["art. 7º", "art. 18", "art. 33", "art. 41", "art. 48", "ANPD", "Marco Civil", "15 dias", "Google", "Facebook", "Instagram", "verificação em duas etapas", "provedor de pagamento", "hash", "Encarregado", "Open Finance", "maiores de 18"]) {
      expect(t, needle).toContain(needle);
    }
    expect(PRIVACY_POLICY.sections.map((s) => s.id)).toEqual(expect.arrayContaining(["dados", "finalidades", "direitos", "prazos", "seguranca", "internacional", "login-social", "duas-etapas", "pagamentos"]));
  });

  it("os Termos cobrem o teste grátis, o modo somente leitura, o cancelamento e o arrependimento de 7 dias, e o foro do consumidor", () => {
    const t = allText(TERMS_OF_USE);
    for (const needle of ["30 dias", "somente leitura", "cancela", "7 dias", "art. 49", "Decreto nº 7.962/2013", "art. 101, I", "154-A", "9.609/1998", "9.610/1998", "consumidor.gov.br", "não prestamos consultoria"]) {
      expect(t.toLowerCase(), needle).toContain(needle.toLowerCase());
    }
    expect(TERMS_OF_USE.sections.map((s) => s.id)).toEqual(expect.arrayContaining(["planos", "cancelamento", "lei-foro", "responsabilidade"]));
  });

  it("cada lei citada tem nome, número e explicação, e o documento lista as leis que menciona", () => {
    for (const law of Object.values(LAWS)) {
      expect(law.name.length).toBeGreaterThan(2);
      expect(law.ref).toMatch(/\d/);
      expect(law.about.length).toBeGreaterThan(30);
    }
    expect(PRIVACY_POLICY.laws.map((l) => l.name)).toEqual(expect.arrayContaining(["LGPD", "Marco Civil da Internet", "Código de Defesa do Consumidor"]));
    expect(TERMS_OF_USE.laws.map((l) => l.name)).toEqual(expect.arrayContaining(["Código de Defesa do Consumidor", "LGPD"]));
  });

  it("ícones usados são nomes simples, sem espaços", () => {
    for (const d of [PRIVACY_POLICY, TERMS_OF_USE]) {
      expect(d.icon).toMatch(/^[a-z0-9-]+$/);
      for (const h of d.highlights) expect(h.icon).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

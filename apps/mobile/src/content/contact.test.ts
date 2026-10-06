import { describe, expect, it } from "vitest";
import { mailtoLink, SUPPORT, SUPPORT_NEVER_ASKS, SUPPORT_TOPICS, whatsappLink } from "./contact";

describe("contato com o suporte", () => {
  it("o e-mail e o WhatsApp são os informados pelo responsável", () => {
    expect(SUPPORT.email).toBe("financascontact2026@gmail.com");
    expect(SUPPORT.whatsappDisplay).toBe("(47) 99292-0469");
  });

  it("o link do WhatsApp usa o formato wa.me: DDI 55 + DDD + número, só dígitos", () => {
    expect(SUPPORT.whatsappDigits).toMatch(/^55\d{10,11}$/);
    expect(SUPPORT.whatsappDigits).toBe("5547992920469");
    expect(whatsappLink()).toBe("https://wa.me/5547992920469");
    const withText = whatsappLink("Olá! Preciso de ajuda & tenho 2 dúvidas.");
    expect(withText).toBe(`https://wa.me/5547992920469?text=${encodeURIComponent("Olá! Preciso de ajuda & tenho 2 dúvidas.")}`);
    expect(new URL(withText).searchParams.get("text")).toBe("Olá! Preciso de ajuda & tenho 2 dúvidas.");
  });

  it("o link de e-mail abre o programa de e-mail, com assunto e texto codificados", () => {
    expect(mailtoLink()).toBe("mailto:financascontact2026@gmail.com");
    const link = mailtoLink("Dúvida sobre a assinatura", "Olá!\nPreciso de ajuda.");
    expect(link.startsWith("mailto:financascontact2026@gmail.com?")).toBe(true);
    const query = new URLSearchParams(link.split("?")[1]);
    expect(query.get("subject")).toBe("Dúvida sobre a assinatura");
    expect(query.get("body")).toBe("Olá!\nPreciso de ajuda.");
  });

  it("avisa o que o suporte nunca pede e oferece assuntos prontos", () => {
    expect(SUPPORT_NEVER_ASKS.join(" ")).toMatch(/senha/);
    expect(SUPPORT_NEVER_ASKS.join(" ")).toMatch(/código/);
    expect(new Set(SUPPORT_TOPICS.map((t) => t.id)).size).toBe(SUPPORT_TOPICS.length);
    expect(SUPPORT_TOPICS.some((t) => t.id === "privacy")).toBe(true);
  });
});

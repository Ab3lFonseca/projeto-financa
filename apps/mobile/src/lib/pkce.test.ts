import { describe, expect, it } from "vitest";
import { base64url, makePkce, toBase64url } from "./pkce";

// Web Crypto existe no Node 20+ (testes) e no navegador; no app o SHA-256 vem do expo-crypto.
const webCrypto = (globalThis as unknown as { crypto: { subtle: { digest(alg: string, data: Uint8Array): Promise<ArrayBuffer> }; getRandomValues(a: Uint8Array): Uint8Array } }).crypto;
const sha256Base64 = async (text: string) => btoa(String.fromCharCode(...new Uint8Array(await webCrypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))));
const randomBytes = (n: number) => webCrypto.getRandomValues(new Uint8Array(n));
const fromBase64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

describe("PKCE", () => {
  it("base64url não tem '+', '/' nem '='", () => {
    expect(base64url(new Uint8Array([251, 255, 190]))).toBe("-_--");
    expect(base64url(new Uint8Array([1]))).toBe("AQ");
    expect(toBase64url("ab+/cd==")).toBe("ab-_cd");
  });

  it("confere com o vetor de teste do próprio RFC 7636 (apêndice B), o mesmo cálculo que o servidor faz", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const pkce = await makePkce(() => fromBase64url(verifier), sha256Base64);
    expect(pkce.verifier).toBe(verifier);
    expect(pkce.challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("o verifier tem 43 caracteres válidos e o desafio também", async () => {
    const { verifier, challenge } = await makePkce(randomBytes, sha256Base64);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).not.toBe(verifier);
  });

  it("cada par é diferente", async () => {
    const a = await makePkce(randomBytes, sha256Base64);
    const b = await makePkce(randomBytes, sha256Base64);
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
  });
});

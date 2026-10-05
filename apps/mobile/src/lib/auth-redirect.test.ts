import { describe, expect, it } from "vitest";
import { parseAuthRedirect } from "./auth-redirect";

const WEB = "https://financa-web.onrender.com/confirm-email";

describe("retorno do link do e-mail", () => {
  it("cadastro confirmado: fragmento com access_token e type=signup", () => {
    expect(parseAuthRedirect(`${WEB}#access_token=abc.def.ghi&expires_in=3600&refresh_token=xyz&token_type=bearer&type=signup`)).toEqual({ kind: "success", flow: "signup" });
    expect(parseAuthRedirect("financa://confirm-email#access_token=a&type=signup")).toEqual({ kind: "success", flow: "signup" });
  });

  it("outros fluxos de sucesso", () => {
    expect(parseAuthRedirect(`${WEB}#access_token=a&type=email_change`)).toEqual({ kind: "success", flow: "email_change" });
    expect(parseAuthRedirect(`${WEB}#access_token=a&type=recovery`)).toEqual({ kind: "success", flow: "other" });
    // primeira etapa da troca segura de e-mail: só uma mensagem, sem token
    expect(parseAuthRedirect(`${WEB}#message=Confirmation+link+accepted`)).toEqual({ kind: "success", flow: "other" });
  });

  it("link vencido ou já usado", () => {
    const expired = `${WEB}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`;
    expect(parseAuthRedirect(expired)).toEqual({ kind: "error", reason: "expired", code: "otp_expired" });
    expect(parseAuthRedirect(`${WEB}#error=access_denied`)).toEqual({ kind: "error", reason: "denied", code: "access_denied" });
    expect(parseAuthRedirect(`${WEB}#error=server_error&error_code=unexpected_failure`)).toEqual({ kind: "error", reason: "unknown", code: "unexpected_failure" });
    expect(parseAuthRedirect(`${WEB}#error_description=algo`)).toMatchObject({ kind: "error", reason: "unknown" });
  });

  it("aceita os parâmetros também na query (?) e só o texto do fragmento", () => {
    expect(parseAuthRedirect(`${WEB}?error=access_denied&error_code=otp_expired`)).toMatchObject({ kind: "error", reason: "expired" });
    expect(parseAuthRedirect("#access_token=a&type=signup")).toEqual({ kind: "success", flow: "signup" });
    expect(parseAuthRedirect("error_code=otp_expired")).toMatchObject({ kind: "error", reason: "expired" });
  });

  it("sem parâmetros (abriu a tela direto) → none", () => {
    expect(parseAuthRedirect(WEB)).toEqual({ kind: "none" });
    expect(parseAuthRedirect(`${WEB}#`)).toEqual({ kind: "none" });
    expect(parseAuthRedirect(null)).toEqual({ kind: "none" });
    expect(parseAuthRedirect(undefined)).toEqual({ kind: "none" });
    expect(parseAuthRedirect("")).toEqual({ kind: "none" });
  });

  it("nunca devolve tokens nem texto vindo da URL (só valores fixos)", () => {
    const hostile = `${WEB}#access_token=SEGREDO-123&refresh_token=SEGREDO-456&type=signup&error_description=%3Cscript%3Ealert(1)%3C/script%3E`;
    const json = JSON.stringify(parseAuthRedirect(hostile));
    expect(json).not.toContain("SEGREDO");
    expect(json).not.toContain("script");
    const withError = JSON.stringify(parseAuthRedirect(`${WEB}#error_code=${"x".repeat(500)}`));
    expect(withError.length).toBeLessThan(120); // o código é cortado em 64 caracteres
  });
});

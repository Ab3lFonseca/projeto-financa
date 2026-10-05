import { describe, expect, it } from "vitest";
import { localApiOnPublicHost } from "./api-url";

describe("site publicado apontando para a API local", () => {
  it("avisa quando o site está num domínio público e a API é localhost", () => {
    const msg = localApiOnPublicHost("financa-web.onrender.com", "http://localhost:3000");
    expect(msg).toContain("financa-web.onrender.com");
    expect(msg).toContain("EXPO_PUBLIC_API_URL");
    expect(localApiOnPublicHost("meu-app.exemplo.com", "http://127.0.0.1:3000")).not.toBeNull();
    expect(localApiOnPublicHost("meu-app.exemplo.com", "https://localhost")).not.toBeNull();
  });

  it("não avisa em desenvolvimento local nem quando a API é pública", () => {
    expect(localApiOnPublicHost("localhost", "http://localhost:3000")).toBeNull();
    expect(localApiOnPublicHost("127.0.0.1", "http://localhost:3000")).toBeNull();
    expect(localApiOnPublicHost("financa-web.onrender.com", "https://financa-api.onrender.com")).toBeNull();
    // não confunde um domínio que apenas contém "localhost"
    expect(localApiOnPublicHost("financa-web.onrender.com", "https://localhost.exemplo.com")).toBeNull();
  });

  it("sem página (app nativo) não avisa", () => {
    expect(localApiOnPublicHost(undefined, "http://localhost:3000")).toBeNull();
    expect(localApiOnPublicHost(null, "http://10.0.2.2:3000")).toBeNull();
  });
});

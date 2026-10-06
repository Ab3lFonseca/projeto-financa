import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { otpauthUri } from "./otpauth";
import { QR_QUIET_ZONE, qrModules, qrPath } from "./qr";

/** Refaz a matriz a partir do caminho SVG que o app desenha (para provar que o desenho é o mesmo código). */
function matrixFromPath(d: string, size: number): boolean[][] {
  const out = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
    const [x, y, w, back] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    expect(back).toBe(w);
    for (let i = 0; i < w; i++) out[y]![x + i] = true;
  }
  return out;
}

/** Pinta o QR como um celular o veria: branco, margem de 4 módulos e `scale` pixels por módulo. */
function raster(modules: boolean[][], scale = 6) {
  const side = (modules.length + QR_QUIET_ZONE * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  modules.forEach((row, my) =>
    row.forEach((dark, mx) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (mx + QR_QUIET_ZONE) * scale + dx;
          const py = (my + QR_QUIET_ZONE) * scale + dy;
          const at = (py * side + px) * 4;
          data[at] = data[at + 1] = data[at + 2] = 0;
        }
      }
    }),
  );
  return { data, side };
}

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

describe("QR do autenticador", () => {
  it("o desenho do app (caminho SVG) é exatamente a matriz do código, sem módulos a mais ou a menos", () => {
    const modules = qrModules("otpauth://totp/Finan%C3%A7a:a%40b.com?secret=" + SECRET);
    const redrawn = matrixFromPath(qrPath(modules), modules.length);
    expect(redrawn).toEqual(modules);
  });

  it("um leitor de QR decodifica o desenho de volta para o endereço otpauth (é isso que o celular faz)", () => {
    const uri = otpauthUri({ secret: SECRET, account: "pessoa@exemplo.com.br" })!;
    const modules = qrModules(uri);
    const { data, side } = raster(matrixFromPath(qrPath(modules), modules.length));
    const read = jsQR(data, side, side);
    expect(read?.data).toBe(uri);
  });

  it("continua legível com o caractere ç e com e-mails compridos", () => {
    const uri = otpauthUri({ secret: SECRET, account: "nome.bem.comprido.da.silva+financas@subdominio.empresa-exemplo.com.br", issuer: "Finança" })!;
    expect(uri).toContain("Finan%C3%A7a");
    const modules = qrModules(uri);
    const { data, side } = raster(modules, 5);
    expect(jsQR(data, side, side)?.data).toBe(uri);
  });

  it("tem as marcas de posição (3 cantos) e o tamanho é quadrado", () => {
    const modules = qrModules("teste");
    expect(modules.length).toBeGreaterThanOrEqual(21);
    expect(modules.every((row) => row.length === modules.length)).toBe(true);
    const size = modules.length;
    // O canto de cada marca de posição é sempre escuro (superior esquerdo, superior direito, inferior esquerdo); o inferior direito não tem.
    expect(modules[0]![0]).toBe(true);
    expect(modules[0]![size - 1]).toBe(true);
    expect(modules[size - 1]![0]).toBe(true);
  });
});

describe("endereço otpauth://", () => {
  it("monta o endereço com o nome do app e a conta, no formato dos aplicativos autenticadores", () => {
    expect(otpauthUri({ secret: SECRET, account: "a@b.com" })).toBe(`otpauth://totp/Finan%C3%A7a:a%40b.com?secret=${SECRET}&issuer=Finan%C3%A7a`);
  });

  it("é curto o bastante para um QR pequeno e fácil de ler (e-mail comum: até 45 módulos; e-mail muito longo: até 49)", () => {
    const common = otpauthUri({ secret: SECRET, account: "pessoa@exemplo.com.br" })!;
    expect(qrModules(common).length).toBeLessThanOrEqual(45);
    const long = otpauthUri({ secret: SECRET, account: "nome.comprido.da.silva@provedor-de-email.com.br" })!;
    expect(qrModules(long).length).toBeLessThanOrEqual(49);
  });

  it("aceita a chave com espaços e minúsculas (como aparece na tela)", () => {
    const spaced = SECRET.toLowerCase().replace(/(.{4})/g, "$1 ").trim();
    expect(otpauthUri({ secret: spaced, account: "a@b.com" })).toContain(`secret=${SECRET}&`);
  });

  it("recusa chave inválida em vez de desenhar um QR que não funciona", () => {
    expect(otpauthUri({ secret: "", account: "a@b.com" })).toBeNull();
    expect(otpauthUri({ secret: "curta", account: "a@b.com" })).toBeNull();
    expect(otpauthUri({ secret: "1".repeat(32), account: "a@b.com" })).toBeNull(); // 1 não existe em base32
  });
});

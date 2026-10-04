// Gera os ícones do app (PNG) sem dependências: gradiente índigo→violeta com três barras
// ascendentes (símbolo de "evolução financeira"). Troque por arte final antes de publicar:
// os arquivos em assets/ são apenas um ponto de partida coerente.
//
//   pnpm --filter @app/mobile assets
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dirname, "..", "assets");
mkdirSync(OUT, { recursive: true });

// ---------- PNG ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro "none"
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- desenho (SDF com antialiasing) ----------
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Distância assinada a um retângulo arredondado centrado em (cx, cy). */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * @param size lado em pixels
 * @param opts.background desenha o gradiente (senão, fundo transparente)
 * @param opts.scale escala do símbolo (1 = ocupa ~60% do lado)
 * @param opts.rounded recorta os cantos do fundo (favicon)
 */
function render(size, { background, scale = 1, rounded = false }) {
  const buf = Buffer.alloc(size * size * 4);
  const c1 = hex("#4F46E5");
  const c2 = hex("#7C3AED");
  const bars = [
    { x: -0.215, h: 0.26, a: 0.55 },
    { x: 0, h: 0.4, a: 0.78 },
    { x: 0.215, h: 0.58, a: 1 },
  ];
  const barW = 0.15 * scale;
  const base = 0.29 * scale; // meia altura da base em relação ao centro
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size - 0.5;
      const ny = (y + 0.5) / size - 0.5;
      let rgb = [0, 0, 0];
      let alpha = 0;
      if (background) {
        rgb = mix(c1, c2, clamp01((nx + ny) / 2 + 0.5));
        alpha = rounded ? clamp01(0.5 - sdRoundRect(nx * size, ny * size, 0, 0, size / 2, size / 2, size * 0.22)) : 1;
      }
      for (const b of bars) {
        const hh = (b.h * scale) / 2;
        const cx = b.x * scale;
        const cy = base - hh;
        const d = sdRoundRect(nx * size, ny * size, cx * size, cy * size, (barW / 2) * size, hh * size, (barW / 2) * size * 0.9);
        const cov = clamp01(0.5 - d) * b.a;
        if (cov > 0) {
          const out = cov + alpha * (1 - cov);
          rgb = out > 0 ? rgb.map((v, i) => (255 * cov + v * alpha * (1 - cov)) / out) : rgb;
          alpha = out;
        }
      }
      const i = (y * size + x) * 4;
      buf[i] = Math.round(rgb[0]);
      buf[i + 1] = Math.round(rgb[1]);
      buf[i + 2] = Math.round(rgb[2]);
      buf[i + 3] = Math.round(alpha * 255);
    }
  }
  return buf;
}

const files = [
  ["icon.png", 1024, { background: true, scale: 1.1 }],
  ["adaptive-icon.png", 1024, { background: false, scale: 0.9 }], // zona segura do Android
  ["splash-icon.png", 1024, { background: false, scale: 1.1 }],
  ["favicon.png", 96, { background: true, scale: 1.1, rounded: true }],
];
for (const [name, size, opts] of files) {
  writeFileSync(join(OUT, name), encodePng(size, render(size, opts)));
  console.log(`gerado ${name} (${size}x${size})`);
}

import { encode } from "uqr";

/** Margem branca em volta do QR, em módulos. 4 é o mínimo da norma: com menos, muitos leitores não acham o código. */
export const QR_QUIET_ZONE = 4;

/** Módulos do QR (true = escuro), sem margem. Correção de erro M: aguenta um pouco de sujeira ou reflexo na tela. */
export function qrModules(text: string): boolean[][] {
  return encode(text, { ecc: "M", border: 0 }).data;
}

/** Desenho do QR como um único caminho SVG: uma faixa por sequência de módulos escuros seguidos na linha (bem menos peças que um quadradinho por módulo). */
export function qrPath(modules: boolean[][]): string {
  const parts: string[] = [];
  modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end]) end++;
      parts.push(`M${x} ${y}h${end - x}v1h-${end - x}z`);
      x = end;
    }
  });
  return parts.join("");
}

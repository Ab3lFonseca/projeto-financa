// Dinheiro SEMPRE em centavos inteiros. Nunca float.
// Sem Intl de propósito: o formato precisa ser idêntico em API, Hermes (Android/iOS) e web.

/** Teto de um valor individual: R$ 10 bilhões em centavos (bem abaixo de 2^53). */
export const MAX_CENTS = 1_000_000_000_000;

export type FormatMoneyOptions = {
  /** Mostra "+" para valores positivos (útil em variações). */
  signed?: boolean;
  /** Omite o símbolo "R$ ". */
  noSymbol?: boolean;
  /** Omite os centavos quando forem ",00" (ex.: "R$ 7.200"). */
  hideZeroCents?: boolean;
};

/** 123456 → "R$ 1.234,56" ; -500 → "-R$ 5,00". */
export function formatBRL(cents: number, options: FormatMoneyOptions = {}): string {
  const value = Math.round(cents);
  const negative = value < 0;
  const abs = Math.abs(value);
  const reais = Math.floor(abs / 100);
  const centavos = abs % 100;
  const reaisStr = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const centsStr = String(centavos).padStart(2, "0");
  const number = options.hideZeroCents && centavos === 0 ? reaisStr : `${reaisStr},${centsStr}`;
  const body = options.noSymbol ? number : `R$ ${number}`;
  if (negative) return `-${body}`;
  return options.signed && abs > 0 ? `+${body}` : body;
}

/**
 * Converte o que o usuário digita em centavos. Aceita "1.234,56", "1234,56", "1234.56",
 * "R$ 12", "12". Retorna null se não for um valor válido.
 */
export function parseMoneyToCents(input: string): number | null {
  let s = input.replace(/R\$/gi, "").replace(/\s/g, "");
  if (s === "") return null;
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^[0-9.,]+$/.test(s)) return null;

  let intPart: string;
  let decPart = "";
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0) {
    // vírgula é o separador decimal; pontos são milhares
    intPart = s.slice(0, lastComma).replace(/\./g, "");
    decPart = s.slice(lastComma + 1);
    if (decPart.includes(".") || decPart.includes(",")) return null;
  } else if (lastDot >= 0 && s.length - lastDot - 1 <= 2 && s.indexOf(".") === lastDot) {
    // único ponto com até 2 dígitos depois: decimal ("1234.5")
    intPart = s.slice(0, lastDot);
    decPart = s.slice(lastDot + 1);
  } else {
    // pontos como milhares ("1.234.567")
    if (!/^\d{1,3}(\.\d{3})*$/.test(s) && s.includes(".")) return null;
    intPart = s.replace(/\./g, "");
  }
  if (intPart.includes(",") || intPart.includes(".")) return null;
  if (intPart === "" && decPart === "") return null;
  if (decPart.length > 2) return null;
  if (intPart === "") intPart = "0";
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return negative ? -cents : cents;
}

/**
 * Divide um total em N parcelas sem perder centavo: as primeiras `total % n` parcelas
 * recebem 1 centavo a mais. A soma das parcelas é SEMPRE igual ao total.
 */
export function splitInstallments(totalCents: number, count: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new RangeError("total inválido");
  if (!Number.isInteger(count) || count < 1) throw new RangeError("número de parcelas inválido");
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Variação percentual (arredondada, 1 casa decimal) de `previous` para `current`.
 * Retorna null quando não há base de comparação (previous <= 0).
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

import { useMemo } from "react";
import Svg, { Path, Rect } from "react-native-svg";
import { QR_QUIET_ZONE, qrModules, qrPath } from "@/lib/qr";

/**
 * QR code desenhado aqui mesmo (preto sobre branco, com a margem exigida), a partir do texto. Sempre preto e branco, de propósito: o tema do app
 * (claro/escuro/cores) nunca pode reduzir o contraste de um código que o celular precisa ler. Cada módulo ocupa um número INTEIRO de pixels
 * (por isso o desenho pode ficar um pouco menor que `size`): bordas nítidas, sem costuras entre os quadradinhos.
 */
export function QrCode({ value, size = 240, label = "QR code" }: { value: string; size?: number; label?: string }) {
  const { d, side } = useMemo(() => {
    const modules = qrModules(value);
    return { d: qrPath(modules), side: modules.length + QR_QUIET_ZONE * 2 };
  }, [value]);
  const px = Math.max(2, Math.floor(size / side)) * side;
  return (
    <Svg width={px} height={px} viewBox={`${-QR_QUIET_ZONE} ${-QR_QUIET_ZONE} ${side} ${side}`} accessibilityLabel={label} accessibilityRole="image">
      <Rect x={-QR_QUIET_ZONE} y={-QR_QUIET_ZONE} width={side} height={side} fill="#FFFFFF" />
      <Path d={d} fill="#000000" />
    </Svg>
  );
}

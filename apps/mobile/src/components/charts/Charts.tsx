import { useState, type ReactNode } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import { formatBRL, formatCompactBRL } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "../ui/Text";
import { niceScale, smoothPath } from "./scale";

// ---------------------------------------------------------------------------- rosca

export type Slice = { value: number; color: string; label?: string };

/** Gráfico de rosca. O conteúdo (children) fica no centro. */
export function DonutChart({ data, size = 168, thickness = 22, children }: { data: Slice[]; size?: number; thickness?: number; children?: ReactNode }) {
  const { colors } = useTheme();
  const total = data.reduce((s, d) => s + Math.max(d.value, 0), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = data.filter((d) => d.value > 0).length > 1 ? 2.5 : 0;
  let acc = 0;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {/* A rotação é feita no View (RN) e não no SVG: `origin` do react-native-svg não existe na web. */}
      <View style={{ transform: [{ rotate: "-90deg" }] }}>
      <Svg width={size} height={size} accessibilityLabel="Gráfico de rosca">
        <G>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={thickness} fill="none" />
          {total > 0
            ? data.map((d, i) => {
                if (d.value <= 0) return null;
                const len = Math.max((d.value / total) * c - gap, 0.5);
                const el = (
                  <Circle
                    key={`${i}-${d.color}`}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={d.color}
                    strokeWidth={thickness}
                    strokeDasharray={`${len} ${c - len}`}
                    strokeDashoffset={-acc}
                    strokeLinecap="butt"
                    fill="none"
                  />
                );
                acc += (d.value / total) * c;
                return el;
              })
            : null}
        </G>
      </Svg>
      </View>
      <View style={{ position: "absolute", alignItems: "center", justifyContent: "center", width: size - thickness * 2 - 8 }}>{children}</View>
    </View>
  );
}

// ---------------------------------------------------------------------------- barras

export type BarDatum = { key: string; label: string; values: number[] };

/**
 * Barras agrupadas (uma barra por série, ex.: receitas × despesas). Aceita valores negativos
 * (linha-base no zero). Toque numa barra para ver os valores.
 */
export function BarChart({
  data,
  colors: seriesColors,
  seriesLabels,
  height = 200,
  empty = "Sem dados no período",
}: {
  data: BarDatum[];
  colors: string[];
  seriesLabels?: string[];
  height?: number;
  empty?: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const all = data.flatMap((d) => d.values);
  const hasData = all.some((v) => v !== 0);
  const scale = niceScale(Math.min(0, ...all), Math.max(0, ...all, 1), 4);
  const padL = 46;
  const padB = 24;
  const padT = 8;
  const innerW = Math.max(width - padL - 4, 1);
  const innerH = height - padB - padT;
  const y = (v: number) => padT + ((scale.max - v) / (scale.max - scale.min)) * innerH;
  const groupW = data.length > 0 ? innerW / data.length : innerW;
  const barW = Math.min(26, (groupW * 0.7) / Math.max(seriesColors.length, 1));
  const sel = selected !== null ? data[selected] : null;

  return (
    <View onLayout={onLayout} style={{ width: "100%" }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {scale.values.map((v, vi) => (
            <G key={`y${vi}`}>
              <Line x1={padL} x2={width} y1={y(v)} y2={y(v)} stroke={v === 0 ? colors.textFaint : colors.border} strokeWidth={v === 0 ? 1 : 0.75} strokeDasharray={v === 0 ? undefined : "3 4"} />
              <SvgText x={padL - 8} y={y(v) + 4} fontSize={10} fill={colors.textFaint} textAnchor="end">
                {formatCompactBRL(v)}
              </SvgText>
            </G>
          ))}
          {data.map((d, i) => {
            const gx = padL + i * groupW + groupW / 2;
            const totalW = barW * d.values.length + 3 * (d.values.length - 1);
            return (
              <G key={d.key} opacity={selected === null || selected === i ? 1 : 0.45}>
                {d.values.map((v, s) => {
                  const bx = gx - totalW / 2 + s * (barW + 3);
                  const top = y(Math.max(v, 0));
                  const bottom = y(Math.min(v, 0));
                  return <Rect key={s} x={bx} y={top} width={barW} height={Math.max(bottom - top, v === 0 ? 0 : 1.5)} rx={Math.min(6, barW / 2.5)} fill={seriesColors[s] ?? colors.primary} />;
                })}
                <SvgText x={gx} y={height - 6} fontSize={10} fill={selected === i ? colors.text : colors.textMuted} textAnchor="middle" fontWeight={selected === i ? "700" : "400"}>
                  {d.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
      {/* Áreas de toque como views do RN por cima do SVG (funciona igual em iOS, Android e web). */}
      {width > 0 ? (
        <View style={{ position: "absolute", left: padL, top: 0, width: innerW, height, flexDirection: "row" }}>
          {data.map((d, i) => (
            <Pressable key={d.key} accessibilityRole="button" accessibilityLabel={`${d.label}: ver valores`} onPress={() => setSelected(selected === i ? null : i)} style={{ flex: 1 }} />
          ))}
        </View>
      ) : null}
      {!hasData && width > 0 ? (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height, alignItems: "center", justifyContent: "center" }}>
          <Text tone="faint" variant="bodySm">
            {empty}
          </Text>
        </View>
      ) : null}
      {sel ? (
        <View style={{ marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: colors.surfaceAlt, gap: 4 }}>
          <Text variant="caption" tone="muted" weight="600">
            {sel.label}
          </Text>
          <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
            {sel.values.map((v, s) => (
              <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: seriesColors[s] }} />
                <Text variant="bodySm" weight="600" tabular>
                  {seriesLabels?.[s] ? `${seriesLabels[s]}: ` : ""}
                  {formatBRL(v)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------- linha

export type LinePoint = { label: string; value: number };

/** Linha suave com área em degradê. Toque num ponto para ver o valor. */
export function LineChart({ points, height = 200, color, bars }: { points: LinePoint[]; height?: number; color?: string; /** pinta a área como barras finas (fluxo acumulado) */ bars?: boolean }) {
  const { colors } = useTheme();
  const tint = color ?? colors.primary;
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const values = points.map((p) => p.value);
  const scale = niceScale(Math.min(...values, 0), Math.max(...values, 1), 4);
  const padL = 46;
  const padB = 24;
  const padT = 10;
  const innerW = Math.max(width - padL - 12, 1);
  const innerH = height - padB - padT;
  const y = (v: number) => padT + ((scale.max - v) / (scale.max - scale.min)) * innerH;
  const x = (i: number) => padL + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const coords = points.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const line = smoothPath(coords);
  const area = coords.length > 1 ? `${line} L ${coords[coords.length - 1]!.x} ${y(Math.max(scale.min, 0))} L ${coords[0]!.x} ${y(Math.max(scale.min, 0))} Z` : "";
  const labelEvery = Math.max(1, Math.ceil(points.length / 5));
  const sel = selected !== null ? points[selected] : null;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ width: "100%" }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={tint} stopOpacity={0.28} />
              <Stop offset="1" stopColor={tint} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {scale.values.map((v, vi) => (
            <G key={`y${vi}`}>
              <Line x1={padL} x2={width - 4} y1={y(v)} y2={y(v)} stroke={v === 0 ? colors.textFaint : colors.border} strokeWidth={v === 0 ? 1 : 0.75} strokeDasharray={v === 0 ? undefined : "3 4"} />
              <SvgText x={padL - 8} y={y(v) + 4} fontSize={10} fill={colors.textFaint} textAnchor="end">
                {formatCompactBRL(v)}
              </SvgText>
            </G>
          ))}
          {area && !bars ? <Path d={area} fill="url(#area)" /> : null}
          {coords.length > 1 ? <Path d={line} stroke={tint} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {coords.length === 1 ? <Circle cx={coords[0]!.x} cy={coords[0]!.y} r={4} fill={tint} /> : null}
          {selected !== null ? (
            <G>
              <Line x1={coords[selected]!.x} x2={coords[selected]!.x} y1={padT} y2={height - padB} stroke={colors.textFaint} strokeDasharray="3 3" />
              <Circle cx={coords[selected]!.x} cy={coords[selected]!.y} r={5} fill={colors.surface} stroke={tint} strokeWidth={3} />
            </G>
          ) : null}
          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <SvgText key={`l${i}`} x={x(i)} y={height - 6} fontSize={10} fill={colors.textMuted} textAnchor="middle">
                {p.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
      {width > 0
        ? points.map((p, i) => {
            const colW = innerW / Math.max(points.length, 1);
            return (
              <Pressable
                key={`t${i}`}
                accessibilityRole="button"
                accessibilityLabel={`${p.label}: ver valor`}
                onPress={() => setSelected(selected === i ? null : i)}
                style={{ position: "absolute", left: x(i) - colW / 2, top: 0, width: colW, height }}
              />
            );
          })
        : null}
      {sel ? (
        <View style={{ marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: colors.surfaceAlt, flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="caption" tone="muted" weight="600">
            {sel.label}
          </Text>
          <Text variant="bodySm" weight="700" tabular>
            {formatBRL(sel.value)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Legenda de séries (bolinha + nome). */
export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: i.color }} />
          <Text variant="caption" tone="muted">
            {i.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

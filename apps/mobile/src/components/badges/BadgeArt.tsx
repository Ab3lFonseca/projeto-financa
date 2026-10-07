import type { BadgeTier } from "@app/shared";
import { memo, useEffect, useId } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Stop } from "react-native-svg";
import { Sparkle } from "@/components/art/Sparkle";
import { Icon } from "@/components/Icon";
import { C, crestPath, crown, facets, laurel, pointsAttr, polygon, polyPath, progressArc, scallopPath, starburst, VIEW, wing } from "./badgeShapes";
import { LOCKED_STYLE, TIER_STYLE, type TierStyle } from "./badgeTheme";

type Props = {
  /** Nível a desenhar: 1 (Bronze) a 6 (Mestre). 0 = ainda não ganha (cinza, com cadeado de progresso). */
  tier: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Nome do ícone no centro. */
  icon: string;
  size?: number;
  /** Quanto falta para o próximo nível (0 a 1): enche um anel em volta. Sem valor, sem anel. */
  progress?: number;
  /** Cor do anel (a do próximo nível). */
  ringColor?: string;
  /** Brilhos e luz pulsando (Diamante e Mestre). Desligue em listas grandes. */
  animated?: boolean;
};

const TIERS: BadgeTier[] = ["bronze", "silver", "gold", "platinum", "diamond", "master"];

/** Gradiente diagonal (claro → escuro) com um id único por medalha (várias na mesma tela não se misturam). */
function Gradient({ id, s, reverse }: { id: string; s: TierStyle; reverse?: boolean }) {
  return (
    <LinearGradient id={id} x1="0.15" y1="0" x2="0.85" y2="1">
      <Stop offset="0" stopColor={reverse ? s.dark : s.light} />
      <Stop offset="0.5" stopColor={s.mid} />
      <Stop offset="1" stopColor={reverse ? s.light : s.dark} />
    </LinearGradient>
  );
}

/** Reflexo de vidro no alto à esquerda. */
function Gloss({ rx = 30, ry = 17, opacity = 0.28 }: { rx?: number; ry?: number; opacity?: number }) {
  return <Ellipse cx={C - 10} cy={C - 28} rx={rx} ry={ry} fill="#FFFFFF" opacity={opacity} transform={`rotate(-24 ${C - 10} ${C - 28})`} />;
}

function Body({ tier, s, ids }: { tier: BadgeTier; s: TierStyle; ids: { main: string; inner: string; glow: string } }) {
  const outline = { stroke: s.rim, strokeWidth: 1.6 } as const;
  const bevel = { stroke: s.hi, strokeWidth: 1.2, opacity: 0.85 } as const;
  switch (tier) {
    case "bronze":
      return (
        <G>
          <Circle cx={C} cy={C} r={46} fill={`url(#${ids.main})`} {...outline} />
          <Circle cx={C} cy={C} r={39} fill={`url(#${ids.inner})`} {...bevel} />
          {polygon(C, C, 42.5, 12).map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={1.7} fill={s.hi} opacity={0.9} />
          ))}
          <Gloss />
        </G>
      );
    case "silver":
      return (
        <G>
          <Path d={scallopPath(C, C, 49, 42, 8)} fill={`url(#${ids.main})`} {...outline} />
          <Circle cx={C} cy={C} r={35} fill={`url(#${ids.inner})`} {...bevel} />
          <Circle cx={C} cy={C} r={30} fill="none" stroke={s.rim} strokeWidth={0.8} opacity={0.35} />
          <Gloss />
        </G>
      );
    case "gold":
      return (
        <G>
          {laurel(C, C, 53, 6).map((l, i) => (
            <Ellipse key={i} cx={l.cx} cy={l.cy} rx={2.6} ry={6} fill={s.dark} stroke={s.rim} strokeWidth={0.6} transform={`rotate(${l.rot} ${l.cx} ${l.cy})`} />
          ))}
          <Polygon points={pointsAttr(starburst(C, C, 49, 40, 12))} fill={`url(#${ids.main})`} {...outline} strokeLinejoin="round" />
          <Circle cx={C} cy={C} r={35} fill={`url(#${ids.inner})`} {...bevel} />
          <Circle cx={C} cy={C} r={30} fill="none" stroke={s.rim} strokeWidth={0.8} opacity={0.4} />
          <Gloss />
        </G>
      );
    case "platinum":
      return (
        <G>
          <Polygon points={pointsAttr(polygon(C, C, 49, 6))} fill={`url(#${ids.main})`} {...outline} strokeLinejoin="round" />
          <Polygon points={pointsAttr(polygon(C, C, 41, 6))} fill="none" stroke={s.hi} strokeWidth={1.4} opacity={0.9} strokeLinejoin="round" />
          <Polygon points={pointsAttr(polygon(C, C, 35, 6))} fill={`url(#${ids.inner})`} stroke={s.rim} strokeWidth={0.8} strokeLinejoin="round" />
          {polygon(C, C, 45, 6).map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={2} fill={s.hi} stroke={s.rim} strokeWidth={0.6} />
          ))}
          <Gloss rx={26} ry={13} opacity={0.3} />
        </G>
      );
    case "diamond": {
      const list = facets(C, C, 49);
      return (
        <G>
          <Polygon points={pointsAttr(polygon(C, C, 52, 8, -90 + 22.5))} fill={s.glow} opacity={0.35} />
          {list.slice(1).map((f, i) => (
            <Path key={i} d={polyPath(f.points)} fill={f.shade > 0.7 ? s.light : f.shade > 0.5 ? s.mid : s.dark} stroke={s.hi} strokeWidth={0.8} opacity={0.5 + 0.5 * f.shade} strokeLinejoin="round" />
          ))}
          <Path d={polyPath(list[0]!.points)} fill={`url(#${ids.inner})`} stroke={s.hi} strokeWidth={1.4} strokeLinejoin="round" />
          <Polygon points={pointsAttr(polygon(C, C, 49, 8, -90 + 22.5))} fill="none" stroke={s.rim} strokeWidth={1.6} strokeLinejoin="round" />
          <Gloss rx={22} ry={11} opacity={0.35} />
        </G>
      );
    }
    case "master": {
      const gem = crown().gems;
      return (
        <G>
          {[-1, 1].map((side) =>
            wing(side as -1 | 1).map((d, i) => <Path key={`${side}${i}`} d={d} fill={`url(#${ids.inner})`} stroke={s.hi} strokeWidth={0.8} opacity={0.75 - i * 0.1} />),
          )}
          <Path d={crestPath()} fill={`url(#${ids.main})`} stroke={s.rim} strokeWidth={2} strokeLinejoin="round" />
          <Path d={crestPath(0.84)} fill={`url(#${ids.inner})`} stroke={s.hi} strokeWidth={1.4} strokeLinejoin="round" />
          <Path d={crestPath(0.7)} fill="none" stroke={s.hi} strokeWidth={0.7} opacity={0.4} strokeLinejoin="round" />
          <Path d={crown().path} fill="#FBBF24" stroke="#92400E" strokeWidth={1.2} strokeLinejoin="round" />
          {gem.map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={2.6} fill={i === 1 ? "#F472B6" : "#67E8F9"} stroke="#92400E" strokeWidth={0.6} />
          ))}
          <Gloss rx={26} ry={12} opacity={0.22} />
        </G>
      );
    }
  }
}

/**
 * A insígnia desenhada. Cada nível tem a própria silhueta e as próprias cores (Bronze, Prata, Ouro, Platina, Diamante e, no topo, o Mestre em
 * roxo profundo com brasão, coroa e asas). Bloqueada, vira cinza e mostra um anel que enche até o próximo nível.
 */
export const BadgeArt = memo(function BadgeArt({ tier, icon, size = 96, progress, ringColor, animated = false }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const reduce = useReducedMotion();
  const name = tier === 0 ? null : TIERS[tier - 1]!;
  const s = name ? TIER_STYLE[name] : LOCKED_STYLE;
  const ids = { main: `m${uid}`, inner: `i${uid}`, glow: `g${uid}` };
  const live = animated && !reduce && (tier === 5 || tier === 6);

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!live) return;
    pulse.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [live, pulse]);
  const aura = useAnimatedStyle(() => ({ opacity: 0.5 + 0.5 * pulse.value, transform: [{ scale: 1 + 0.06 * pulse.value }] }));

  const k = size / VIEW;
  return (
    <View style={{ width: size, height: size, opacity: tier === 0 ? 0.78 : 1 }} accessibilityRole="image">
      {name && tier >= 3 ? (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: -size * 0.12, top: -size * 0.12, width: size * 1.24, height: size * 1.24 }, live ? aura : { opacity: 0.7 }]}>
          <Svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
            <Defs>
              <RadialGradient id={ids.glow} cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0.55" stopColor={s.glow} stopOpacity={tier === 6 ? 0.55 : 0.4} />
                <Stop offset="1" stopColor={s.glow} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={0.5} cy={0.5} r={0.5} fill={`url(#${ids.glow})`} />
          </Svg>
        </Animated.View>
      ) : null}
      <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
        <Defs>
          <Gradient id={ids.main} s={s} />
          <Gradient id={ids.inner} s={s} reverse />
        </Defs>
        {progress !== undefined ? (
          <G>
            <Circle cx={C} cy={C} r={57} fill="none" stroke={s.rim} strokeWidth={2.4} opacity={0.25} />
            {progress > 0 ? <Path d={progressArc(C, C, 57, progress)} fill="none" stroke={ringColor ?? TIER_STYLE.bronze.mid} strokeWidth={3} strokeLinecap="round" /> : null}
          </G>
        ) : null}
        {name ? (
          <G transform={progress !== undefined ? `translate(${C} ${C}) scale(0.9) translate(${-C} ${-C})` : undefined}>
            <Body tier={name} s={s} ids={ids} />
          </G>
        ) : (
          <G transform={progress !== undefined ? `translate(${C} ${C}) scale(0.9) translate(${-C} ${-C})` : undefined}>
            <Circle cx={C} cy={C} r={46} fill={`url(#${ids.main})`} stroke={s.rim} strokeWidth={1.6} />
            <Circle cx={C} cy={C} r={39} fill={`url(#${ids.inner})`} stroke="#4B5563" strokeWidth={1} opacity={0.8} />
          </G>
        )}
      </Svg>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: tier === 6 ? size * 0.1 : 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={Math.round(size * (tier === 6 ? 0.3 : 0.38))} color={s.icon} strokeWidth={2.2} />
      </View>
      {live ? (
        <>
          <Sparkle size={Math.max(8, 14 * k * 1.4)} color="#FFFFFF" style={{ left: size * 0.06, top: size * 0.14 }} delay={100} />
          <Sparkle size={Math.max(6, 10 * k * 1.4)} color={tier === 6 ? "#DDD6FE" : "#CFFAFE"} style={{ right: size * 0.05, top: size * 0.3 }} delay={700} duration={1500} />
          <Sparkle size={Math.max(8, 12 * k * 1.4)} color="#FDE68A" style={{ right: size * 0.2, bottom: size * 0.06 }} delay={450} duration={2000} />
        </>
      ) : null}
    </View>
  );
});

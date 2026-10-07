import { BADGE_TIERS, TIER_LABEL, TIER_POINTS, formatBadgeValue, tierReached, type BadgeDef, type BadgeStateDTO } from "@app/shared";
import { View } from "react-native";
import { Badge, ProgressBar } from "@/components/ui/Controls";
import { Text } from "@/components/ui/Text";
import { dateBR } from "@/lib/account";
import { tierName } from "@/lib/badges";
import { useTheme } from "@/theme/ThemeProvider";
import { BadgeArt } from "./BadgeArt";
import { tierColor } from "./badgeTheme";

/** Conteúdo da folha de uma insígnia: arte grande, o que conta, como evoluir, a escada dos 6 níveis e quanto falta para o próximo. */
export function BadgeDetail({ def, state }: { def: BadgeDef; state: BadgeStateDTO }) {
  const { colors, radius } = useTheme();
  const level = Math.max(state.level, tierReached(def, state.value));
  const next = level < 6 ? { tier: tierName(level + 1), threshold: def.thresholds[level]! } : null;
  const from = level > 0 && tierReached(def, state.value) === level ? def.thresholds[level - 1]! : 0;
  const progress = next ? Math.max(0, Math.min(1, (state.value - from) / Math.max(1, next.threshold - from))) : 1;

  return (
    <View style={{ gap: 16, paddingBottom: 12 }}>
      <View style={{ alignItems: "center", gap: 8 }}>
        <BadgeArt tier={state.level as 0 | 1 | 2 | 3 | 4 | 5 | 6} icon={def.icon} size={150} animated />
        <Text variant="title" align="center">
          {def.name}
        </Text>
        {state.level > 0 ? <Badge label={`Nível ${TIER_LABEL[tierName(state.level)]}`} tone={state.level === 6 ? "primary" : "positive"} /> : <Badge label="Ainda não conquistada" />}
        <Text tone="muted" align="center" style={{ fontStyle: "italic" }}>
          “{def.lore}”
        </Text>
      </View>

      <View style={{ gap: 4 }}>
        <Text weight="700">O que conta</Text>
        <Text variant="bodySm" tone="muted">
          {def.what}
        </Text>
        <Text weight="700" style={{ marginTop: 8 }}>
          Como evoluir
        </Text>
        <Text variant="bodySm" tone="muted">
          {def.how}
        </Text>
      </View>

      <View style={{ gap: 6, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text variant="caption" tone="muted" weight="600">
            Agora
          </Text>
          <Text weight="700" tabular>
            {formatBadgeValue(def.unit, state.value)}
          </Text>
        </View>
        {next ? (
          <>
            <ProgressBar value={progress * 100} color={tierColor(next.tier)} height={10} />
            <Text variant="caption" tone="muted">
              Próximo: {TIER_LABEL[next.tier]} em {formatBadgeValue(def.unit, next.threshold)} · faltam {formatBadgeValue(def.unit, Math.max(1, next.threshold - state.value))}
            </Text>
          </>
        ) : (
          <Text variant="caption" tone="positive" weight="600">
            Nível máximo: você é Mestre nesta insígnia!
          </Text>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <Text weight="700">Os 6 níveis</Text>
        {BADGE_TIERS.map((t, i) => {
          const got = state.level >= i + 1;
          const date = state.earnedAt[i];
          return (
            <View key={t} style={{ flexDirection: "row", alignItems: "center", gap: 12, opacity: got ? 1 : 0.7 }}>
              <BadgeArt tier={(got ? i + 1 : 0) as 0 | 1 | 2 | 3 | 4 | 5 | 6} icon={def.icon} size={48} />
              <View style={{ flex: 1 }}>
                <Text weight="600">{TIER_LABEL[t]}</Text>
                <Text variant="caption" tone="muted">
                  {formatBadgeValue(def.unit, def.thresholds[i]!)} · +{TIER_POINTS[t]} pontos
                </Text>
              </View>
              {got && date ? (
                <Text variant="caption" tone="positive" weight="600">
                  {dateBR(date)}
                </Text>
              ) : (
                <Text variant="caption" tone="faint">
                  Bloqueado
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

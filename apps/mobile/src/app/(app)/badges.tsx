import { BADGE_CATEGORIES, BADGES, TIER_LABEL, tierReached, type BadgeDef, type BadgeStateDTO } from "@app/shared";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { BadgeArt } from "@/components/badges/BadgeArt";
import { BadgeDetail } from "@/components/badges/BadgeDetail";
import { tierColor } from "@/components/badges/badgeTheme";
import { Chip, ChipRow, ProgressBar } from "@/components/ui/Controls";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/Feedback";
import { Card, Reveal, Screen, ScreenHeader } from "@/components/ui/Layout";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { filterBadges, tierName, type BadgeFilter } from "@/lib/badges";
import { useBadges } from "@/lib/hooks";
import { useTheme } from "@/theme/ThemeProvider";

const STATUS: { id: BadgeFilter["status"]; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "earned", label: "Conquistadas" },
  { id: "progress", label: "Em andamento" },
  { id: "locked", label: "Para começar" },
];

/** Coleção de insígnias: resumo, filtros por assunto e situação, e o detalhe de cada uma (os 6 níveis, o que conta e quanto falta). */
export default function BadgesScreen() {
  const q = useBadges();
  const [category, setCategory] = useState<BadgeFilter["category"]>("all");
  const [status, setStatus] = useState<BadgeFilter["status"]>("all");
  const [open, setOpen] = useState<string | null>(null);
  const header = <ScreenHeader title="Insígnias" subtitle="Sua coleção" backTo="/more" />;

  if (q.isLoading && !q.data) {
    return (
      <Screen header={header}>
        <SkeletonCard lines={3} />
        <SkeletonCard lines={5} />
      </Screen>
    );
  }
  if (q.isError && !q.data) {
    return (
      <Screen header={header}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }
  const data = q.data;
  if (!data) return null;

  const rows = filterBadges(data.items, { category, status });
  const best = [...data.items].sort((a, b) => b.level - a.level || BADGES.findIndex((d) => d.id === a.id) - BADGES.findIndex((d) => d.id === b.id))[0];
  const bestDef = best ? BADGES.find((d) => d.id === best.id) : undefined;
  const opened = open ? rows.find((r) => r.def.id === open) ?? filterBadges(data.items, { category: "all", status: "all" }).find((r) => r.def.id === open) : undefined;

  return (
    <Screen header={header} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Reveal index={0}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          {best && bestDef ? <BadgeArt tier={best.level as 0 | 1 | 2 | 3 | 4 | 5 | 6} icon={bestDef.icon} size={92} animated /> : null}
          <View style={{ flex: 1, gap: 6 }}>
            <Text variant="heading">
              {data.summary.unlocked} de {data.summary.total} insígnias
            </Text>
            <ProgressBar value={(data.summary.unlocked / Math.max(1, data.summary.total)) * 100} height={10} />
            <Text variant="caption" tone="muted">
              {data.summary.points} pontos · {data.summary.tiersEarned} níveis{data.summary.masters > 0 ? ` · ${data.summary.masters} Mestre${data.summary.masters === 1 ? "" : "s"}` : ""}
            </Text>
          </View>
        </Card>
      </Reveal>

      <View style={{ gap: 10 }}>
        <ChipRow>
          <Chip label="Todas" selected={category === "all"} onPress={() => setCategory("all")} />
          {BADGE_CATEGORIES.map((c) => (
            <Chip key={c.id} label={c.label} icon={c.icon} selected={category === c.id} onPress={() => setCategory(c.id)} />
          ))}
        </ChipRow>
        <ChipRow>
          {STATUS.map((s) => (
            <Chip key={s.id} label={s.label} selected={status === s.id} onPress={() => setStatus(s.id)} />
          ))}
        </ChipRow>
      </View>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon="gem" title="Nada por aqui ainda" message="Nenhuma insígnia neste filtro. Mude o filtro ou continue usando o app: elas chegam sozinhas." />
        </Card>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {rows.map(({ def, state }) => (
            <BadgeTile key={def.id} def={def} state={state} onPress={() => setOpen(def.id)} />
          ))}
        </View>
      )}

      <Sheet visible={!!opened} onClose={() => setOpen(null)}>
        {opened ? <BadgeDetail def={opened.def} state={opened.state} /> : null}
      </Sheet>
    </Screen>
  );
}

function BadgeTile({ def, state, onPress }: { def: BadgeDef; state: BadgeStateDTO; onPress: () => void }) {
  const { colors, radius } = useTheme();
  const level = Math.max(state.level, tierReached(def, state.value));
  const hasProgress = level < 6 && state.value > 0;
  const nextColor = tierColor(tierName(Math.min(6, level + 1)));
  const from = level > 0 && tierReached(def, state.value) === level ? def.thresholds[level - 1]! : 0;
  const ratio = level < 6 ? Math.max(0, Math.min(1, (state.value - from) / Math.max(1, def.thresholds[level]! - from))) : 1;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${def.name}. ${state.level > 0 ? `Nível ${TIER_LABEL[tierName(state.level)]}` : "Ainda não conquistada"}`}
      onPress={onPress}
      style={{ flexGrow: 1, flexBasis: "30%", minWidth: 96, maxWidth: 170, alignItems: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 6, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: state.unseen.length > 0 ? colors.accent : colors.border }}
    >
      <BadgeArt tier={state.level as 0 | 1 | 2 | 3 | 4 | 5 | 6} icon={def.icon} size={72} progress={hasProgress ? ratio : state.level === 0 ? 0 : undefined} ringColor={nextColor} />
      <Text variant="caption" weight="700" align="center" numberOfLines={2}>
        {def.name}
      </Text>
      <Text variant="caption" tone={state.level > 0 ? "positive" : "faint"} align="center" numberOfLines={1}>
        {state.level > 0 ? TIER_LABEL[tierName(state.level)] : state.value > 0 ? "Em andamento" : "Para começar"}
      </Text>
    </Pressable>
  );
}

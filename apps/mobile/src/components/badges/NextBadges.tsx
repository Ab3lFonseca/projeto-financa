import { TIER_LABEL } from "@app/shared";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { ProgressBar } from "@/components/ui/Controls";
import { Card, Divider, Section } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { nextGoals } from "@/lib/badges";
import { useBadges } from "@/lib/hooks";
import { BadgeArt } from "./BadgeArt";
import { tierColor } from "./badgeTheme";

/** Início: as insígnias mais perto de subir de nível, para dar vontade de completar. Não aparece enquanto não houver progresso em nenhuma. */
export function NextBadges() {
  const { data } = useBadges();
  const goals = nextGoals(data?.items ?? [], 3);
  if (goals.length === 0) return null;
  return (
    <Section title="Próximas conquistas" action="Ver todas" onAction={() => router.push("/badges" as never)}>
      <Card style={{ paddingVertical: 6 }}>
        {goals.map((g, i) => (
          <View key={g.def.id}>
            {i > 0 ? <Divider inset={72} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${g.def.name}: ${g.remaining} para o nível ${TIER_LABEL[g.nextTier]}`}
              onPress={() => router.push("/badges" as never)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12 }}
            >
              <BadgeArt tier={g.state.level as 0 | 1 | 2 | 3 | 4 | 5 | 6} icon={g.def.icon} size={52} progress={g.progress} ringColor={tierColor(g.nextTier)} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text weight="700" numberOfLines={1}>
                  {g.def.name}
                </Text>
                <ProgressBar value={g.progress * 100} color={tierColor(g.nextTier)} height={6} />
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {g.remaining} para {TIER_LABEL[g.nextTier]}
                </Text>
              </View>
            </Pressable>
          </View>
        ))}
      </Card>
    </Section>
  );
}

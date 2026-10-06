import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Controls";
import { GoChevron, PressableRow } from "@/components/ui/Interactive";
import { Card, Divider, IconBadge, Reveal, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { itemsByStatus, ROADMAP_SECTIONS, roadmapItem, type RoadmapItem, type RoadmapStatus } from "@/content/roadmap";
import { useTheme } from "@/theme/ThemeProvider";

const STATUS_BADGE: Record<RoadmapStatus, { label: string; tone: "primary" | "warning" | "positive" }> = {
  building: { label: "Em desenvolvimento", tone: "primary" },
  soon: { label: "Em breve", tone: "warning" },
  done: { label: "Disponível", tone: "positive" },
};

const monthLabel = (since: string) => {
  const [y, m] = since.split("-");
  const names = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${names[Number(m) - 1]} de ${y}`;
};

/** Mural: o que já chegou e o que está a caminho. Itens com explicação abrem uma folha (para que serve, como vai funcionar, o que esperar). */
export default function UpdatesScreen() {
  const params = useLocalSearchParams<{ item?: string }>();
  const [openId, setOpenId] = useState<string | null>(null);

  // Vem de um atalho (ex.: o convite "em breve" da Carteira): já abre a explicação do item.
  useEffect(() => {
    const target = roadmapItem(params.item);
    if (target?.preview) setOpenId(target.id);
  }, [params.item]);

  const open = roadmapItem(openId ?? undefined);
  return (
    <Screen header={<ScreenHeader title="Novidades" subtitle="O que já chegou e o que vem por aí" />}>
      {ROADMAP_SECTIONS.map((section, si) => {
        const items = itemsByStatus(section.status);
        if (items.length === 0) return null;
        return (
          <Reveal key={section.status} index={si}>
            <Section title={section.title}>
              <Text variant="caption" tone="muted" style={{ marginTop: -6 }}>
                {section.hint}
              </Text>
              <Card style={{ paddingVertical: 6 }}>
                {items.map((item, i) => (
                  <View key={item.id}>
                    {i > 0 ? <Divider inset={52} /> : null}
                    <UpdateRow item={item} onOpen={() => setOpenId(item.id)} />
                  </View>
                ))}
              </Card>
            </Section>
          </Reveal>
        );
      })}
      <Text variant="caption" tone="faint" align="center">
        Sem datas marcadas de propósito: preferimos lançar quando estiver bom. Novidades aparecem aqui.
      </Text>
      <PreviewSheet item={open} onClose={() => setOpenId(null)} />
    </Screen>
  );
}

/** Linha do mural. O resumo pode ocupar várias linhas; itens com explicação são tocáveis. */
function UpdateRow({ item, onOpen }: { item: RoadmapItem; onOpen: () => void }) {
  const body = (hovered?: boolean) => (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: item.preview ? 10 : 12 }}>
      <IconBadge icon={item.icon} size={40} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text weight="600">{item.title}</Text>
        <Text variant="bodySm" tone="muted">
          {item.summary}
        </Text>
        {item.status === "done" && item.since ? (
          <Text variant="caption" tone="faint">
            {monthLabel(item.since)}
          </Text>
        ) : null}
      </View>
      {item.preview ? <GoChevron hovered={hovered} /> : null}
    </View>
  );
  if (!item.preview) return body();
  return (
    <PressableRow onPress={onOpen} label={item.title}>
      {({ hovered }) => body(hovered)}
    </PressableRow>
  );
}

function PreviewSheet({ item, onClose }: { item: RoadmapItem | undefined; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <Sheet visible={!!item} onClose={onClose} title={item?.title}>
      {item?.preview ? (
        <View style={{ gap: 18, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Badge label={STATUS_BADGE[item.status].label} tone={STATUS_BADGE[item.status].tone} />
            {item.since ? (
              <Text variant="caption" tone="muted">
                {monthLabel(item.since)}
              </Text>
            ) : null}
          </View>
          <Block title="Para que serve">
            <Text tone="muted">{item.preview.purpose}</Text>
          </Block>
          <Block title="Como vai funcionar">
            {item.preview.how.map((step, i) => (
              <View key={step} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                  <Text variant="caption" weight="700" tone="primary">
                    {i + 1}
                  </Text>
                </View>
                <Text style={{ flex: 1 }} tone="muted">
                  {step}
                </Text>
              </View>
            ))}
          </Block>
          <Block title="O que esperar">
            {item.preview.expect.map((line) => (
              <View key={line} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <Icon name="circle-check" size={18} color={colors.positive} />
                <Text style={{ flex: 1 }} tone="muted">
                  {line}
                </Text>
              </View>
            ))}
          </Block>
          <Button label="Entendi" variant="secondary" onPress={onClose} />
        </View>
      ) : null}
    </Sheet>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text weight="700">{title}</Text>
      {children}
    </View>
  );
}

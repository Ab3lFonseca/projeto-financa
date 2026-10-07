import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { HeroBanner, type BannerTone } from "@/components/art/HeroBanner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/Button";
import { Reveal, Screen, ScreenHeader } from "@/components/ui/Layout";
import { Sheet } from "@/components/ui/Sheet";
import { Text } from "@/components/ui/Text";
import { todayIn } from "@app/shared";
import { itemsByStatus, isRecent, ROADMAP_SECTIONS, roadmapItem, type RoadmapItem, type RoadmapStatus } from "@/content/roadmap";
import { useMe } from "@/lib/auth/AuthProvider";
import { noveltyGradient } from "@/lib/noveltyLook";
import { useTheme } from "@/theme/ThemeProvider";

const STATUS_LOOK: Record<RoadmapStatus, { tone: BannerTone; badge: string }> = {
  building: { tone: "primary", badge: "Em desenvolvimento" },
  soon: { tone: "violet", badge: "Em breve" },
  done: { tone: "positive", badge: "Já disponível" },
};

/** Cada quadro passa a cena da sua animação de novo a cada ~11 s (com variação), para quem está mais abaixo na lista também ver quando chegar nele. */
const FLIGHT_REPEAT_MS = 11_000;

/** "7 de outubro de 2026" a partir de AAAA-MM-DD. */
const dayLabel = (since: string) => {
  const [y, m, d] = since.split("-");
  const names = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${Number(d)} de ${names[Number(m) - 1]} de ${y}`;
};

/** Mural de novidades em banners: degradê, mensagem centralizada, brilhos que piscam e foguete no que está sendo construído agora. */
export default function UpdatesScreen() {
  const params = useLocalSearchParams<{ item?: string }>();
  const [openId, setOpenId] = useState<string | null>(null);

  // Vem de um atalho (ex.: o convite "em breve" da Carteira): já abre a explicação do item.
  useEffect(() => {
    const target = roadmapItem(params.item);
    if (target?.preview) setOpenId(target.id);
  }, [params.item]);

  const open = roadmapItem(openId ?? undefined);
  const today = todayIn(useMe().profile.timezone);
  let order = 0;
  return (
    <Screen header={<ScreenHeader title="Novidades" subtitle="Mural de atualizações do Finança" />}>
      <HeroBanner tone="slate" icon="rocket" badge="Mural de atualizações" title="Estamos sempre construindo" subtitle="Tudo o que é novo aparece aqui, com a data, do mais recente para o mais antigo. O que ainda vem por aí não tem data marcada: preferimos lançar quando estiver bom." flight="rocket-ltr" />

      {ROADMAP_SECTIONS.map((section) => {
        const items = itemsByStatus(section.status);
        if (items.length === 0) return null;
        return (
          <View key={section.status} style={{ gap: 12 }}>
            <Reveal index={order + 1}>
              <View style={{ alignItems: "center", gap: 2, paddingTop: 8 }}>
                <Text variant="heading">{section.title}</Text>
                <Text variant="caption" tone="muted">
                  {section.hint}
                </Text>
              </View>
            </Reveal>
            {items.map((item) => {
              const look = STATUS_LOOK[item.status];
              const delay = 120 + 90 * order++;
              return (
                <HeroBanner
                  key={item.id}
                  compact
                  tone={look.tone}
                  icon={item.icon}
                  badge={item.status === "done" && item.since ? `${isRecent(item.since, today) ? "Novo" : look.badge} · ${dayLabel(item.since)}` : look.badge}
                  title={item.title}
                  subtitle={item.summary}
                  colors={noveltyGradient(item.hue)}
                  flight={item.flight}
                  flightRepeatMs={FLIGHT_REPEAT_MS}
                  delay={delay}
                  hint={item.preview ? (item.status === "done" ? "Toque para ver o que mudou e como usar" : "Toque para ver como vai funcionar") : undefined}
                  onPress={item.preview ? () => setOpenId(item.id) : undefined}
                />
              );
            })}
          </View>
        );
      })}
      <PreviewSheet item={open} onClose={() => setOpenId(null)} />
    </Screen>
  );
}

function PreviewSheet({ item, onClose }: { item: RoadmapItem | undefined; onClose: () => void }) {
  const { colors } = useTheme();
  const look = item ? STATUS_LOOK[item.status] : null;
  return (
    <Sheet visible={!!item} onClose={onClose}>
      {item?.preview && look ? (
        <View style={{ gap: 18, paddingBottom: 8 }}>
          <HeroBanner compact tone={look.tone} icon={item.icon} badge={look.badge} title={item.title} colors={noveltyGradient(item.hue)} flight={item.flight} />
          <Block title={item.status === "done" ? "O que aconteceu" : "Para que serve"}>
            <Text tone="muted">{item.preview.purpose}</Text>
          </Block>
          <Block title={item.status === "done" ? "O que mudou e como usar" : "Como vai funcionar"}>
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
          <Block title={item.status === "done" ? "Bom saber" : "O que esperar"}>
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

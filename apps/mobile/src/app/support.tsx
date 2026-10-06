import { useState } from "react";
import { Pressable, View } from "react-native";
import { HeroBanner } from "@/components/art/HeroBanner";
import { Icon } from "@/components/Icon";
import { SupportActions, SupportSafetyNote } from "@/components/feature/SupportActions";
import { Chip } from "@/components/ui/Controls";
import { Card, IconBadge, Reveal, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { SUPPORT_FAQ, SUPPORT_TOPICS } from "@/content/contact";
import { useTheme } from "@/theme/ThemeProvider";

/** Ajuda e suporte: o contato (WhatsApp e e-mail, com os links que abrem direto) e as dúvidas mais comuns. Abre antes e depois do login. */
export default function SupportScreen() {
  const { colors } = useTheme();
  const [topic, setTopic] = useState<(typeof SUPPORT_TOPICS)[number]["id"]>("help");
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const current = SUPPORT_TOPICS.find((t) => t.id === topic) ?? SUPPORT_TOPICS[0];

  return (
    <Screen header={<ScreenHeader title="Ajuda e suporte" backTo="/more" />}>
      <HeroBanner tone="primary" icon="life-buoy" badge="Estamos aqui" title="Fale com a gente" subtitle="Dúvida, problema ou sugestão? Escolha o assunto e toque no canal que preferir." rocket />

      <Reveal index={1}>
        <Section title="Sobre o quê?">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {SUPPORT_TOPICS.map((t) => (
              <Chip key={t.id} label={t.label} selected={topic === t.id} onPress={() => setTopic(t.id)} />
            ))}
          </View>
        </Section>
      </Reveal>

      <Reveal index={2}>
        <SupportActions message={current.message} subject={current.label} />
      </Reveal>
      <Reveal index={3}>
        <SupportSafetyNote />
      </Reveal>

      <Reveal index={4}>
        <Section title="Dúvidas rápidas">
          <View style={{ gap: 10 }}>
            {SUPPORT_FAQ.map((f) => {
              const open = openFaq === f.id;
              return (
                <Card key={f.id} padded={false} style={{ overflow: "hidden", borderColor: open ? colors.accent : colors.border }}>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpenFaq(open ? null : f.id)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
                    <IconBadge icon={f.icon} size={36} />
                    <Text weight="600" style={{ flex: 1 }}>
                      {f.question}
                    </Text>
                    <Icon name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textFaint} />
                  </Pressable>
                  {open ? (
                    <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                      <Text tone="muted">{f.answer}</Text>
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
        </Section>
      </Reveal>
    </Screen>
  );
}

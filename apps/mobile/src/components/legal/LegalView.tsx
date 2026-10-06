import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useEffect } from "react";
import { HeroBanner } from "@/components/art/HeroBanner";
import { Icon } from "@/components/Icon";
import { SupportActions, SupportSafetyNote } from "@/components/feature/SupportActions";
import { Badge } from "@/components/ui/Controls";
import { Card, IconBadge, Row, Section } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import type { LegalBlock, LegalDoc, LegalSection } from "@/content/legal";
import { goBack } from "@/lib/navigation";
import { useTheme } from "@/theme/ThemeProvider";

/** Um bloco de texto do documento: parágrafo, lista, tabela (empilhada, para caber no celular) ou aviso. */
function Block({ block }: { block: LegalBlock }) {
  const { colors, radius } = useTheme();
  switch (block.kind) {
    case "p":
      return <Text tone="muted">{block.text}</Text>;
    case "list":
      return (
        <View style={{ gap: 8 }}>
          {block.items.map((item) => (
            <View key={item} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 8 }} />
              <Text tone="muted" style={{ flex: 1 }}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      );
    case "table":
      return (
        <View style={{ gap: 8 }}>
          {block.rows.map((row, i) => (
            <View key={i} style={{ padding: 12, gap: 6, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderLeftWidth: 3, borderLeftColor: colors.accent }}>
              <Text weight="600">{row[0]}</Text>
              {row.slice(1).map((cell, j) => (
                <View key={j} style={{ gap: 1 }}>
                  <Text variant="caption" tone="faint" weight="600">
                    {block.head[j + 1]}
                  </Text>
                  <Text variant="bodySm" tone="muted">
                    {cell}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    case "note": {
      const warn = block.tone === "warning";
      return (
        <View style={{ flexDirection: "row", gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: warn ? colors.warningSoft : colors.primarySoft }}>
          <Icon name={warn ? "triangle-alert" : "info"} size={18} color={warn ? colors.warning : colors.primary} />
          <Text variant="bodySm" style={{ flex: 1 }}>
            {block.text}
          </Text>
        </View>
      );
    }
  }
}

/** Seta que gira ao abrir/fechar o tópico. */
function Chevron({ open }: { open: boolean }) {
  const { colors } = useTheme();
  const t = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(open ? 1 : 0, { duration: 220 });
  }, [open, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${90 * t.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <Icon name="chevron-right" size={18} color={colors.textFaint} />
    </Animated.View>
  );
}

function SectionCard({ section, open, onToggle }: { section: LegalSection; open: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  return (
    <Animated.View layout={LinearTransition.duration(240)}>
      <Card padded={false} style={{ overflow: "hidden", borderColor: open ? colors.accent : colors.border }}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
          <IconBadge icon={section.icon} size={38} />
          <Text weight="600" style={{ flex: 1 }}>
            {section.heading}
          </Text>
          <Chevron open={open} />
        </Pressable>
        {open ? (
          <Animated.View entering={FadeInDown.duration(260)} style={{ gap: 12, paddingHorizontal: 14, paddingBottom: 16 }}>
            {section.blocks.map((b, i) => (
              <Block key={i} block={b} />
            ))}
          </Animated.View>
        ) : null}
      </Card>
    </Animated.View>
  );
}

/**
 * Documento legal (Termos de Uso ou Política de Privacidade) como as demais telas "de vitrine" do app: banner no alto, o resumo em quatro
 * cartões, as leis que o texto segue e os tópicos que abrem e fecham. O texto vem de `content/legal.ts`.
 */
export function LegalView({ doc }: { doc: LegalDoc }) {
  const { colors, radius } = useTheme();
  const [open, setOpen] = useState<Set<string>>(() => new Set([doc.sections[0]!.id]));
  const allOpen = open.size === doc.sections.length;
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View style={{ gap: 20 }}>
      <HeroBanner tone={doc.tone} icon={doc.icon} badge="Em vigor" title={doc.title} subtitle={`Versão ${doc.version} · atualizada em ${doc.updatedAt}`} />
      <Text tone="muted">{doc.intro}</Text>

      <Section title="Em resumo">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {doc.highlights.map((h, i) => (
            <Animated.View key={h.title} entering={FadeInDown.delay(120 + i * 70).duration(380)} style={{ flexGrow: 1, flexBasis: 240 }}>
              <Card style={{ gap: 8, alignItems: "center" }}>
                <IconBadge icon={h.icon} size={46} />
                <Text weight="700" align="center">
                  {h.title}
                </Text>
                <Text variant="bodySm" tone="muted" align="center">
                  {h.text}
                </Text>
              </Card>
            </Animated.View>
          ))}
        </View>
      </Section>

      <Section title="Leis que seguimos">
        <Card style={{ gap: 14 }}>
          {doc.laws.map((law) => (
            <View key={law.name} style={{ gap: 3 }}>
              <Row gap={8} style={{ flexWrap: "wrap" }}>
                <Text weight="600">{law.name}</Text>
                <Badge label={law.ref} />
              </Row>
              <Text variant="bodySm" tone="muted">
                {law.about}
              </Text>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Leia por tópicos" action={allOpen ? "Recolher tudo" : "Expandir tudo"} onAction={() => setOpen(allOpen ? new Set() : new Set(doc.sections.map((s) => s.id)))}>
        <View style={{ gap: 10 }}>
          {doc.sections.map((s) => (
            <SectionCard key={s.id} section={s} open={open.has(s.id)} onToggle={() => toggle(s.id)} />
          ))}
        </View>
      </Section>

      <HeroBanner compact tone="slate" icon="life-buoy" title="Ficou com dúvida?" subtitle="Fale com a gente: respondemos pelo WhatsApp e pelo e-mail." />
      <SupportActions message={`Olá! Tenho uma dúvida sobre ${doc.key === "privacy" ? "a Política de Privacidade" : "os Termos de Uso"} do Finança.`} subject={`Dúvida: ${doc.title}`} />
      <SupportSafetyNote />
      <Text variant="caption" tone="faint" align="center" style={{ color: colors.textFaint, borderRadius: radius.sm }}>
        Estes textos são modelos de boa-fé e passam por revisão jurídica. Versão {doc.version}.
      </Text>
      <Pressable accessibilityRole="link" onPress={() => goBack("/more")} style={{ alignSelf: "center", padding: 8 }}>
        <Text variant="bodySm" tone="accent" weight="600">
          Voltar
        </Text>
      </Pressable>
    </View>
  );
}

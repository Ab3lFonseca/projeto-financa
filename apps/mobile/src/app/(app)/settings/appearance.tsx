import type { CustomColors, ThemePresetId } from "@app/shared";
import { useMemo, useState } from "react";
import { Pressable, View, useColorScheme } from "react-native";
import { Icon } from "@/components/Icon";
import { ThemePreview } from "@/components/feature/ThemePreview";
import { Button } from "@/components/ui/Button";
import { ColorField } from "@/components/ui/ColorField";
import { Banner } from "@/components/ui/Feedback";
import { smooth, useHover } from "@/components/ui/hover";
import { Card, Screen, ScreenHeader, Section } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { useAppearance } from "@/lib/appearance";
import { toast } from "@/lib/ui-store";
import { contrastWarnings, DEFAULT_CUSTOM, derivePalette, resolveTheme, THEME_META, type ThemeMeta } from "@/theme/presets";
import type { Palette } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

// Sugestões por papel: tons que costumam funcionar. A pessoa pode digitar qualquer cor #RRGGBB (na web, também escolher no espectro).
const SWATCHES = {
  primary: ["#4F46E5", "#3B82F6", "#0EA5E9", "#14B8A6", "#22C55E", "#EAB308", "#F97316", "#EF4444", "#EC4899", "#8B5CF6"],
  accent: ["#0891B2", "#38BDF8", "#A3E635", "#FBBF24", "#FB923C", "#F472B6", "#E879F9", "#34D399", "#F43F5E", "#818CF8"],
  background: ["#F5F6FA", "#FFFFFF", "#FAF7F2", "#EEF2FF", "#111827", "#0A0B10", "#0A1020", "#0F0A1F", "#06130E", "#150A0C"],
  surface: ["#FFFFFF", "#F0F2F7", "#FFFDF8", "#1F2937", "#14161E", "#111A30", "#181230", "#0D1F17", "#201114"],
} as const;

const FIELDS: { key: keyof CustomColors; label: string }[] = [
  { key: "primary", label: "Cor principal (botões e destaques fortes)" },
  { key: "accent", label: "Cor de destaque (selecionados, links e progresso)" },
  { key: "background", label: "Cor de fundo" },
  { key: "surface", label: "Cor dos cartões e menus" },
];

export default function AppearanceScreen() {
  const { colors } = useTheme();
  const system = useColorScheme() === "dark" ? "dark" : "light";
  const { preset, custom, choose, applyCustom } = useAppearance();
  const [editing, setEditing] = useState(preset === "custom");
  const [draft, setDraft] = useState<CustomColors>(custom ?? DEFAULT_CUSTOM);

  // O que o destaque mostra: o tema aplicado ou, ao editar, o personalizado em construção.
  const shown: ThemePresetId = editing ? "custom" : preset;
  const preview = shown === "custom" ? derivePalette(draft) : resolveTheme(shown, custom, system);
  const meta = THEME_META.find((t) => t.id === shown)!;
  const warnings = useMemo(() => contrastWarnings(draft), [draft]);
  const applied = preset === "custom" && custom !== null && JSON.stringify(custom) === JSON.stringify(draft);

  const pick = (id: ThemePresetId) => {
    if (id === "custom") {
      setEditing(true);
      return;
    }
    setEditing(false);
    choose(id);
  };

  const paletteFor = (id: ThemePresetId): { palette: Palette; split?: Palette } => {
    if (id === "system") return { palette: resolveTheme("light", null, system).palette, split: resolveTheme("dark", null, system).palette };
    if (id === "custom") return { palette: derivePalette(editing ? draft : (custom ?? DEFAULT_CUSTOM)).palette };
    return { palette: resolveTheme(id, custom, system).palette };
  };

  return (
    <Screen header={<ScreenHeader title="Aparência" subtitle="Escolha como o app fica para você" />}>
      <Section title="Prévia">
        <ThemePreview palette={preview.palette} scheme={preview.scheme} />
        <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
          {editing ? "Prévia do tema personalizado. Toque em Aplicar para usá-lo no app inteiro." : `Tema atual: ${meta.emoji} ${meta.label}`}
        </Text>
      </Section>

      <Section title="Tema">
        <View accessibilityRole="radiogroup" accessibilityLabel="Temas disponíveis" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {THEME_META.map((t) => (
            <ThemeCard key={t.id} meta={t} {...paletteFor(t.id)} selected={shown === t.id} onPress={() => pick(t.id)} />
          ))}
        </View>
      </Section>

      {editing ? (
        <Section title="Cores personalizadas">
          <Card style={{ gap: 18 }}>
            {FIELDS.map((f) => (
              <ColorField key={f.key} label={f.label} value={draft[f.key]} swatches={SWATCHES[f.key]} onChange={(hex) => setDraft((d) => ({ ...d, [f.key]: hex }))} />
            ))}
            {warnings.map((w) => (
              <Banner key={w} tone="warning" icon="triangle-alert">
                {w}
              </Banner>
            ))}
            <Button
              label={applied ? "Tema aplicado" : "Aplicar tema"}
              icon="check"
              size="lg"
              disabled={applied}
              onPress={() => {
                applyCustom(draft);
                toast.success("Tema personalizado aplicado");
              }}
            />
            <Button label="Restaurar cores padrão" icon="rotate-ccw" variant="secondary" onPress={() => setDraft(DEFAULT_CUSTOM)} />
          </Card>
        </Section>
      ) : null}

      <Text variant="caption" tone="faint" align="center" style={{ color: colors.textFaint }}>
        Seu tema fica salvo na sua conta e vale em todos os aparelhos.
      </Text>
    </Screen>
  );
}

function ThemeCard({ meta, palette, split, selected, onPress }: { meta: ThemeMeta; palette: Palette; split?: Palette; selected: boolean; onPress: () => void }) {
  const { colors, radius } = useTheme();
  const { hovered, hoverProps } = useHover();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={`${meta.label}. ${meta.hint}`}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...hoverProps}
      style={{
        flexGrow: 1,
        flexBasis: "45%",
        gap: 10,
        padding: 10,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: selected || focused ? 2 : 1,
        borderColor: selected || focused ? colors.accent : hovered ? colors.textFaint : colors.border,
        ...smooth,
      }}
    >
      <Swatch palette={palette} split={split} />
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 16 }}>{meta.emoji}</Text>
          <Text weight="700" style={{ flex: 1 }} numberOfLines={1}>
            {meta.label}
          </Text>
          {selected ? <Icon name="check" size={18} color={colors.accent} strokeWidth={3} /> : null}
        </View>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {meta.hint}
        </Text>
      </View>
    </Pressable>
  );
}

/** Miniatura do tema: fundo, um cartão com a cor principal e as duas cores de realce. */
function Swatch({ palette, split }: { palette: Palette; split?: Palette }) {
  return (
    <View style={{ height: 58, borderRadius: 12, overflow: "hidden", backgroundColor: palette.bg, borderWidth: 1, borderColor: palette.border }}>
      {split ? <View style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "50%", backgroundColor: split.bg }} /> : null}
      <View style={{ position: "absolute", left: 10, right: 10, top: 10, height: 22, borderRadius: 8, backgroundColor: split ? "transparent" : palette.surface, borderWidth: split ? 0 : 1, borderColor: palette.border }}>
        {split ? (
          <>
            <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "50%", borderRadius: 8, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }} />
            <View style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "50%", borderRadius: 8, backgroundColor: split.surface, borderWidth: 1, borderColor: split.border }} />
          </>
        ) : (
          <>
            <View style={{ position: "absolute", left: 8, top: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: palette.primary }} />
            <View style={{ position: "absolute", left: 24, top: 8, width: 30, height: 6, borderRadius: 3, backgroundColor: palette.text, opacity: 0.5 }} />
          </>
        )}
      </View>
      <View style={{ position: "absolute", left: 10, bottom: 8, width: 38, height: 8, borderRadius: 4, backgroundColor: palette.primary }} />
      <View style={{ position: "absolute", left: 54, bottom: 8, width: 18, height: 8, borderRadius: 4, backgroundColor: palette.accent }} />
    </View>
  );
}

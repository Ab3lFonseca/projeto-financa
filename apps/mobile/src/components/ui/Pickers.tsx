import { Pressable, View } from "react-native";
import { PICKABLE_ICONS } from "../Icon";
import { Icon } from "../Icon";
import { useTheme } from "@/theme/ThemeProvider";
import { COLOR_CHOICES } from "@/theme/tokens";
import { Text } from "./Text";

/** Paleta de cores (quadradinhos redondos). */
export function ColorPicker({ value, onChange, label = "Cor" }: { value?: string | null; onChange: (c: string) => void; label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text variant="caption" tone="muted" weight="600">
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {COLOR_CHOICES.map((c) => {
          const selected = value?.toLowerCase() === c.toLowerCase();
          return (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={`Cor ${c}`}
              accessibilityState={{ selected }}
              onPress={() => onChange(c)}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c, alignItems: "center", justifyContent: "center", borderWidth: selected ? 3 : 0, borderColor: colors.text }}
            >
              {selected ? <Icon name="check" size={18} color="#fff" strokeWidth={3} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Grade de ícones para categorias e metas. */
export function IconPicker({ value, onChange, color, label = "Ícone" }: { value?: string | null; onChange: (i: string) => void; color?: string | null; label?: string }) {
  const { colors, radius } = useTheme();
  const tint = color ?? colors.primary;
  return (
    <View style={{ gap: 8 }}>
      <Text variant="caption" tone="muted" weight="600">
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {PICKABLE_ICONS.map((name) => {
          const selected = value === name;
          return (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityLabel={`Ícone ${name}`}
              accessibilityState={{ selected }}
              onPress={() => onChange(name)}
              style={{ width: 46, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: selected ? `${tint}26` : colors.surfaceAlt, borderWidth: selected ? 2 : 1, borderColor: selected ? tint : colors.border }}
            >
              <Icon name={name} size={22} color={selected ? tint : colors.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

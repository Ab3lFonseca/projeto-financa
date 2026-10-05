import { createElement, useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { normalizeHex } from "@/theme/color";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "../Icon";
import { Text } from "./Text";

/**
 * Escolha de uma cor: amostra, campo hexadecimal (#RRGGBB, aceita #RGB) e uma fileira de sugestões. Na web, tocar na amostra abre o
 * seletor de cores do navegador (espectro completo); no celular vale o campo hexadecimal e as sugestões.
 */
export function ColorField({ label, value, onChange, swatches }: { label: string; value: string; onChange: (hex: string) => void; swatches: readonly string[] }) {
  const { colors, radius } = useTheme();
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  // Enquanto a pessoa digita, não reescreve o campo (ex.: "#abc" já vale, mas ela ainda pode estar digitando "#abcdef").
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);

  const valid = normalizeHex(text) !== null;
  const type = (t: string) => {
    setText(t);
    const hex = normalizeHex(t);
    if (hex) onChange(hex);
  };

  return (
    <View style={{ gap: 8 }}>
      <Text variant="caption" tone="muted" weight="600">
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: value, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
          {Platform.OS === "web"
            ? createElement("input", {
                type: "color",
                value: value.toLowerCase(),
                "aria-label": `Escolher ${label.toLowerCase()} no seletor de cores`,
                onChange: (e: { target: { value: string } }) => onChange(e.target.value.toUpperCase()),
                style: { position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: 0, padding: 0 },
              })
            : null}
        </View>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            height: 48,
            paddingHorizontal: 12,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: !valid ? colors.negative : focused ? colors.accent : colors.border,
          }}
        >
          <TextInput
            value={text}
            onChangeText={type}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              setText(value); // volta ao último valor válido se ficou pela metade
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            accessibilityLabel={`${label} em hexadecimal`}
            placeholder="#4F46E5"
            placeholderTextColor={colors.textFaint}
            style={{ flex: 1, color: colors.text, fontSize: 16, fontVariant: ["tabular-nums"], outlineStyle: "none" as never }}
          />
          {!valid ? <Icon name="circle-alert" size={18} color={colors.negative} /> : null}
        </View>
      </View>
      {!valid ? (
        <Text variant="caption" tone="negative" accessibilityLiveRegion="polite">
          Use o formato #RRGGBB, por exemplo #4F46E5.
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2, paddingHorizontal: 2 }} style={{ flexGrow: 0 }}>
        {swatches.map((s) => {
          const selected = s.toUpperCase() === value.toUpperCase();
          return (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${s}`}
              accessibilityState={{ selected }}
              onPress={() => onChange(s)}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: s, borderWidth: selected ? 3 : 1, borderColor: selected ? colors.accent : colors.border }}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

import { formatBRL } from "@app/shared";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "../Icon";
import { Text } from "./Text";

type FieldChrome = { label?: string; error?: string | null; helper?: string; style?: StyleProp<ViewStyle> };

function FieldShell({ label, error, helper, children, style }: FieldChrome & { children: ReactNode }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? (
        <Text variant="caption" tone="muted" weight="600">
          {label}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text variant="caption" tone="negative" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" tone="muted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

export type TextFieldProps = Omit<TextInputProps, "style"> & FieldChrome & { secure?: boolean; left?: ReactNode; right?: ReactNode };

export function TextField({ label, error, helper, style, secure, left, right, multiline, onFocus, onBlur, ...input }: TextFieldProps) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const isSecure = !!secure;
  return (
    <FieldShell label={label} error={error} helper={helper} style={style}>
      <View
        style={{
          flexDirection: "row",
          alignItems: multiline ? "flex-start" : "center",
          gap: 8,
          minHeight: multiline ? 96 : 52,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 0,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor: error ? colors.negative : focused ? colors.primary : colors.border,
        }}
      >
        {left}
        <TextInput
          {...input}
          multiline={multiline}
          secureTextEntry={isSecure && hidden}
          accessibilityLabel={label ?? input.placeholder}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          placeholderTextColor={colors.textFaint}
          style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 10, minHeight: multiline ? 72 : undefined, textAlignVertical: multiline ? "top" : "center", outlineStyle: "none" as never }}
        />
        {isSecure ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} accessibilityRole="button" accessibilityLabel={hidden ? "Mostrar senha" : "Ocultar senha"}>
            <Icon name={hidden ? "eye" : "eye-off"} size={20} color={colors.textMuted} />
          </Pressable>
        ) : (
          right
        )}
      </View>
    </FieldShell>
  );
}

const MAX_DIGITS = 12;

/** Campo de valor em reais: o usuário digita só números e o campo formata (1.234,56). Valor em centavos. */
export function MoneyField({
  label,
  value,
  onChange,
  error,
  helper,
  allowNegative,
  large,
  autoFocus,
  style,
  tone,
}: FieldChrome & {
  value: number | null;
  onChange: (cents: number | null) => void;
  allowNegative?: boolean;
  large?: boolean;
  autoFocus?: boolean;
  tone?: "default" | "positive" | "negative";
}) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  const negative = (value ?? 0) < 0;
  const abs = Math.abs(value ?? 0);
  const [text, setText] = useState(value === null ? "" : formatBRL(abs, { noSymbol: true }));

  // mantém o texto em dia quando o valor muda por fora (ex.: edição de lançamento)
  useEffect(() => {
    setText(value === null ? "" : formatBRL(Math.abs(value), { noSymbol: true }));
  }, [value]);

  const color = tone === "positive" ? colors.positive : tone === "negative" ? colors.negative : colors.text;
  return (
    <FieldShell label={label} error={error} helper={helper} style={style}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          minHeight: large ? 72 : 52,
          paddingHorizontal: 14,
          borderRadius: radius.md,
          backgroundColor: large ? "transparent" : colors.surface,
          borderWidth: large ? 0 : 1.5,
          borderColor: error ? colors.negative : focused ? colors.primary : colors.border,
        }}
      >
        {allowNegative ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={negative ? "Valor negativo" : "Valor positivo"}
            onPress={() => onChange(value === null ? null : -value)}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: negative ? colors.negativeSoft : colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}
          >
            <Text weight="700" tone={negative ? "negative" : "muted"}>
              {negative ? "−" : "+"}
            </Text>
          </Pressable>
        ) : null}
        <Text variant={large ? "title" : "body"} tone="muted" weight="600">
          R$
        </Text>
        <TextInput
          value={text}
          autoFocus={autoFocus}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="0,00"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel={label ?? "Valor"}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChangeText={(t) => {
            const digits = t.replace(/\D/g, "").slice(0, MAX_DIGITS);
            if (!digits) {
              setText("");
              onChange(null);
              return;
            }
            const cents = Number(digits);
            setText(formatBRL(cents, { noSymbol: true }));
            onChange(negative ? -cents : cents);
          }}
          style={{
            flex: 1,
            color,
            fontSize: large ? 34 : 16,
            fontWeight: large ? "700" : "400",
            paddingVertical: 8,
            fontVariant: ["tabular-nums"],
            outlineStyle: "none" as never,
          }}
        />
      </View>
    </FieldShell>
  );
}

/** Campo que abre uma lista de opções (mostra o valor escolhido). */
export function SelectField({
  label,
  value,
  placeholder = "Selecionar",
  onPress,
  error,
  left,
  style,
}: FieldChrome & { value?: string | null; placeholder?: string; onPress: () => void; left?: ReactNode }) {
  const { colors, radius } = useTheme();
  return (
    <FieldShell label={label} error={error} style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          minHeight: 52,
          paddingHorizontal: 14,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor: error ? colors.negative : colors.border,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        {left}
        <Text style={{ flex: 1 }} tone={value ? "default" : "faint"} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Icon name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
    </FieldShell>
  );
}

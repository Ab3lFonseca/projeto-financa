import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "../Icon";

export function Checkbox({ checked, onChange, children, error }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; error?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        hitSlop={8}
        style={{
          width: 24,
          height: 24,
          marginTop: 1,
          borderRadius: 7,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: checked ? colors.primary : colors.surface,
          borderWidth: 1.5,
          borderColor: checked ? colors.primary : error ? colors.negative : colors.border,
        }}
      >
        {checked ? <Icon name="check" size={16} color={colors.onPrimary} strokeWidth={3} /> : null}
      </Pressable>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

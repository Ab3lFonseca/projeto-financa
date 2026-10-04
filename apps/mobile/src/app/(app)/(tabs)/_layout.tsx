import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useTheme } from "@/theme/ThemeProvider";

const TABS = [
  { name: "index", title: "Início", icon: "house" },
  { name: "transactions", title: "Transações", icon: "arrow-left-right" },
  { name: "charts", title: "Gráficos", icon: "chart-pie" },
  { name: "wallet", title: "Carteira", icon: "wallet" },
  { name: "more", title: "Mais", icon: "layout-grid" },
] as const;

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 2 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 58 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Platform.OS === "web" ? 6 : insets.bottom,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ title: t.title, tabBarIcon: ({ color, focused }) => <Icon name={t.icon} size={23} color={String(color)} strokeWidth={focused ? 2.4 : 2} /> }}
        />
      ))}
    </Tabs>
  );
}

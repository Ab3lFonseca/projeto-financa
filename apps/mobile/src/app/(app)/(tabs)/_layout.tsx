import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { TourTabButton } from "@/components/tour/TourTabButton";
import { useTheme } from "@/theme/ThemeProvider";

const TABS = [
  { name: "index", title: "Início", icon: "house" },
  { name: "transactions", title: "Transações", icon: "arrow-left-right" },
  { name: "charts", title: "Gráficos", icon: "chart-pie" },
  { name: "wallet", title: "Carteira", icon: "wallet" },
  { name: "investments", title: "Investir", icon: "piggy-bank" },
  { name: "more", title: "Mais", icon: "layout-grid" },
] as const;

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Ícone (28) + rótulo (12 + 2 de margem) + padding do item (10) + padding de cima (6) + borda (1) = 59 antes do respiro de baixo.
  const bottomInset = Platform.OS === "web" ? 6 : insets.bottom;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", marginTop: 2 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 59 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ title: t.title, tabBarButton: (props) => <TourTabButton id={`tab-${t.name}`} {...(props as object)} />, tabBarIcon: ({ color, focused }) => <Icon name={t.icon} size={23} color={String(color)} strokeWidth={focused ? 2.4 : 2} /> }}
        />
      ))}
    </Tabs>
  );
}

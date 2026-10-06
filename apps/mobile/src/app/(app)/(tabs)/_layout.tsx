import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TourTabButton } from "@/components/tour/TourTabButton";
import { TabIcon } from "@/components/ui/TabIcon";
import { TAB_METRICS, tabBarHeight } from "@/components/ui/tabBarMetrics";
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
  // A altura da barra é a soma de tudo o que há dentro dela (ver tabBarMetrics.ts); o respiro de baixo é a área segura (celular) ou 6 px (web).
  const bottomInset = Platform.OS === "web" ? 6 : insets.bottom;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Troca de aba com fade (em vez de corte seco).
        animation: "fade",
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        // Rótulo com linha fixa e sem escala da fonte do sistema: a barra tem altura fixa, então o texto não pode crescer nem ser espremido.
        tabBarAllowFontScaling: false,
        tabBarLabelStyle: { fontSize: 10, lineHeight: TAB_METRICS.labelLine, fontWeight: "600", marginTop: TAB_METRICS.labelGap, flexShrink: 0 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: TAB_METRICS.border,
          height: tabBarHeight(bottomInset),
          paddingTop: TAB_METRICS.barPaddingTop,
          paddingBottom: bottomInset,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ title: t.title, tabBarButton: (props) => <TourTabButton id={`tab-${t.name}`} {...(props as object)} />, tabBarIcon: ({ color, focused }) => <TabIcon name={t.icon} color={String(color)} focused={focused} /> }}
        />
      ))}
    </Tabs>
  );
}

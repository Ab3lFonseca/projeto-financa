import { View } from "react-native";
import { Icon } from "@/components/Icon";
import { Badge, Chip, ProgressBar } from "@/components/ui/Controls";
import { Button } from "@/components/ui/Button";
import { Card, IconBadge, Row } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import type { Scheme } from "@/theme/presets";
import { withAlpha } from "@/theme/color";
import type { Palette } from "@/theme/tokens";
import { ThemeScope, useTheme } from "@/theme/ThemeProvider";

/**
 * Pré-visualização de um tema: uma tela de mentira montada com os componentes REAIS do app (Card, Button, Chip, ProgressBar...)
 * dentro de um `ThemeScope`. Por isso o que aparece aqui é exatamente o que a pessoa verá, e acompanha qualquer mudança dos componentes.
 */
export function ThemePreview({ palette, scheme }: { palette: Palette; scheme: Scheme }) {
  return (
    <ThemeScope palette={palette} scheme={scheme}>
      <PreviewScreen />
    </ThemeScope>
  );
}

function PreviewScreen() {
  const { colors, radius } = useTheme();
  return (
    // As descrições de acessibilidade ficam no contêiner: o conteúdo de mentira não deve ser lido nem receber foco.
    <View
      accessible
      accessibilityLabel="Pré-visualização do tema: saldo, receitas, despesas, botões, progresso e barra de abas"
      importantForAccessibility="no-hide-descendants"
      style={{ borderRadius: radius.xl, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}
      pointerEvents="none"
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
        <View>
          <Text variant="heading">Olá, Maria</Text>
          <Text variant="caption" tone="muted">
            Segunda, 5 de outubro
          </Text>
        </View>
        <Icon name="bell" size={20} color={colors.text} />
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ borderRadius: radius.lg, backgroundColor: colors.primary, padding: 16, gap: 6, overflow: "hidden" }}>
          <View style={{ position: "absolute", right: -30, top: -30, width: 110, height: 110, borderRadius: 55, backgroundColor: withAlpha(colors.onPrimary, 0.1) }} />
          <Text variant="caption" style={{ color: withAlpha(colors.onPrimary, 0.8) }}>
            Saldo total
          </Text>
          <Text variant="title" style={{ color: colors.onPrimary }}>
            R$ 12.480,00
          </Text>
        </View>

        <Row gap={10}>
          <Card style={{ flex: 1, padding: 12, gap: 2 }}>
            <Text variant="caption" tone="muted">
              Receitas
            </Text>
            <Text weight="700" tone="positive">
              R$ 7.200
            </Text>
          </Card>
          <Card style={{ flex: 1, padding: 12, gap: 2 }}>
            <Text variant="caption" tone="muted">
              Despesas
            </Text>
            <Text weight="700" tone="negative">
              R$ 4.850
            </Text>
          </Card>
        </Row>

        <Row gap={8}>
          <Chip label="Este mês" selected />
          <Chip label="Mês passado" />
          <Badge label="Novo" tone="primary" />
        </Row>

        <Card style={{ paddingVertical: 6 }}>
          <Row style={{ paddingVertical: 10 }}>
            <IconBadge icon="utensils" color={colors.accent} size={36} />
            <View style={{ flex: 1 }}>
              <Text weight="500">Supermercado</Text>
              <Text variant="caption" tone="muted">
                Alimentação · Hoje
              </Text>
            </View>
            <Text weight="600" tone="negative">
              −R$ 184,50
            </Text>
          </Row>
          <View style={{ paddingBottom: 12, gap: 6 }}>
            <Text variant="caption" tone="muted">
              Meta de viagem · 65%
            </Text>
            <ProgressBar value={65} />
          </View>
        </Card>

        <Row gap={10}>
          <View style={{ flex: 1 }}>
            <Button label="Salvar" size="sm" />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Cancelar" size="sm" variant="secondary" />
          </View>
        </Row>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-around", paddingVertical: 10, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
        {(["house", "arrow-left-right", "chart-pie", "wallet"] as const).map((name, i) => (
          <View key={name} style={{ alignItems: "center", gap: 2 }}>
            <Icon name={name} size={20} color={i === 0 ? colors.accent : colors.textFaint} strokeWidth={i === 0 ? 2.4 : 2} />
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: i === 0 ? colors.accent : "transparent" }} />
          </View>
        ))}
      </View>
    </View>
  );
}

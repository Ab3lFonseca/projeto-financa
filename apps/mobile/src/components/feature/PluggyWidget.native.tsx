import { Modal, View } from "react-native";
import { PluggyConnect } from "react-native-pluggy-connect";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/theme/ThemeProvider";
import type { PluggyWidgetProps } from "./PluggyWidget.types";

/**
 * Widget oficial do Pluggy (Open Finance). O usuário escolhe o banco e autoriza no app/site do
 * próprio banco; nós nunca vemos nem guardamos credenciais. Só recebemos o id da conexão.
 */
export function PluggyWidget({ visible, connectToken, connectorIds, updateItem, onSuccess, onClose, onError }: PluggyWidgetProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, minHeight: 52 }}>
          <IconButton icon="x" label="Fechar" onPress={onClose} />
          <Text variant="heading">Conectar banco</Text>
        </View>
        <PluggyConnect
          connectToken={connectToken}
          connectorIds={connectorIds}
          updateItem={updateItem ?? undefined}
          language="pt"
          theme={scheme}
          onSuccess={({ item }) => onSuccess(item.id)}
          onError={(e) => onError(e.message)}
          onClose={onClose}
        />
      </View>
    </Modal>
  );
}

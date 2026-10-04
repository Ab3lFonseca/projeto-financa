import { PluggyConnect } from "react-pluggy-connect";
import { useTheme } from "@/theme/ThemeProvider";
import type { PluggyWidgetProps } from "./PluggyWidget.types";

/**
 * Widget oficial do Pluggy no navegador (modal com iframe do próprio Pluggy). O usuário escolhe o banco e autoriza
 * no ambiente do banco (ou do MeuPluggy); nós nunca vemos nem guardamos credenciais, só recebemos o id da conexão.
 * Só os conectores de `connectorIds` aparecem: ninguém digita usuário/senha de banco.
 */
export function PluggyWidget({ visible, connectToken, connectorIds, updateItem, onSuccess, onClose, onError }: PluggyWidgetProps) {
  const { scheme } = useTheme();
  if (!visible || !connectToken) return null;
  return (
    <PluggyConnect
      connectToken={connectToken}
      connectorIds={connectorIds}
      updateItem={updateItem ?? undefined}
      products={["ACCOUNTS", "CREDIT_CARDS", "TRANSACTIONS", "INVESTMENTS"]}
      language="pt"
      theme={scheme}
      onSuccess={({ item }) => onSuccess(item.id)}
      onError={(e) => onError(e.message)}
      onLoadError={(e) => onError(e.message)}
      onClose={onClose}
    />
  );
}

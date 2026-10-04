import { useEffect } from "react";
import { Platform } from "react-native";
import { toast } from "@/lib/ui-store";
import type { PluggyWidgetProps } from "./PluggyWidget.types";

/**
 * Versão para web: o widget oficial usa WebView nativa, então a conexão com o banco só é feita
 * no aplicativo (Android/iOS). Na web mostramos um aviso e fechamos.
 */
export function PluggyWidget({ visible, onClose }: PluggyWidgetProps) {
  useEffect(() => {
    if (!visible) return;
    toast.info(Platform.OS === "web" ? "Conectar bancos está disponível no aplicativo (Android/iOS)." : "Widget indisponível nesta plataforma.");
    onClose();
  }, [visible, onClose]);
  return null;
}

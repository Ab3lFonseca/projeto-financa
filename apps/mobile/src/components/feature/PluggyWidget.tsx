import { useEffect } from "react";
import { Platform } from "react-native";
import { toast } from "@/lib/ui-store";
import type { PluggyWidgetProps } from "./PluggyWidget.types";

/**
 * Reserva para plataformas sem widget: Android/iOS usam `PluggyWidget.native.tsx` e o navegador usa
 * `PluggyWidget.web.tsx`. Aqui mostramos um aviso e fechamos.
 */
export function PluggyWidget({ visible, onClose }: PluggyWidgetProps) {
  useEffect(() => {
    if (!visible) return;
    toast.info(Platform.OS === "web" ? "Conectar bancos está disponível no aplicativo (Android/iOS)." : "Widget indisponível nesta plataforma.");
    onClose();
  }, [visible, onClose]);
  return null;
}

import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";
import { api } from "./api/endpoints";

// Notificações recebidas com o app aberto aparecem como banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/**
 * Pede permissão e registra o token de push na API (só em aparelho real; ignora web/simulador
 * e ambientes sem `projectId` do EAS — o app funciona normalmente sem push).
 */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Avisos",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;

    const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.me.registerPushToken(token.data, Platform.OS === "ios" ? "IOS" : "ANDROID", Constants.deviceName ?? undefined);
  } catch {
    /* push é opcional: nunca bloqueia o uso do app */
  }
}

/** Toque na notificação abre a central de avisos. */
export function listenNotificationTaps(): () => void {
  if (Platform.OS === "web") return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener(() => router.push("/notifications"));
  return () => sub.remove();
}

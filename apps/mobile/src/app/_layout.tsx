import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { router, Stack, usePathname, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState, Platform, Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CelebrationHost } from "@/components/celebration/CelebrationHost";
import { PaywallHost } from "@/components/PaywallHost";
import { TourController } from "@/components/tour/TourController";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { ConfirmHost, ToastHost } from "@/components/ui/Feedback";
import { AuthProvider, useAuth } from "@/lib/auth/AuthProvider";
import { flushErrorReports } from "@/lib/diagnostics";
import { AppLockGate } from "@/lib/lock";
import { flushLogsToStorage, installGlobalErrorHandlers, log, setCurrentScreen, useLogStore } from "@/lib/logger";
import { flushOutbox, useOutbox } from "@/lib/offline/outbox";
import { listenNotificationTaps, registerForPush } from "@/lib/push";
import { PERSIST_MAX_AGE, persister, queryClient } from "@/lib/query";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

void SplashScreen.preventAutoHideAsync();

// Registro de erros: captura o que escapa de qualquer tratamento e recupera o histórico guardado.
installGlobalErrorHandlers();
void useLogStore.getState().load();

// Conectividade e foco do app alimentam o cache: ao voltar a rede ou ao reabrir o app, revalida.
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)));
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"));
}

/** Cuida de tudo que roda "por baixo": fila offline, push e splash. */
function Background() {
  const { status } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "loading") void SplashScreen.hideAsync();
  }, [status]);

  // Cada erro registrado informa em que tela o usuário estava.
  useEffect(() => setCurrentScreen(pathname), [pathname]);

  // Relatórios de erro: envia o que estiver pendente ao entrar, ao voltar ao app e pouco depois de cada
  // novo erro. Ao ir para segundo plano grava o registro no disco (o app pode ser encerrado em seguida).
  useEffect(() => {
    if (status !== "signedIn") return;
    void flushErrorReports();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useLogStore.subscribe((s, prev) => {
      if (s.entries.length === prev.entries.length && s.entries.at(-1)?.count === prev.entries.at(-1)?.count) return;
      if (!s.entries.some((e) => !e.sent && e.level === "error")) return;
      timer ??= setTimeout(() => {
        timer = null;
        void flushErrorReports();
      }, 5_000);
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void flushErrorReports();
      else void flushLogsToStorage();
    });
    return () => {
      unsubscribe();
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [status]);

  useEffect(() => {
    if (status !== "signedIn") return;
    void registerForPush();
    void flushOutbox();
    const unsubscribeNet = NetInfo.addEventListener((s) => {
      if (s.isConnected && s.isInternetReachable !== false) void flushOutbox();
    });
    const appSub = AppState.addEventListener("change", (s) => {
      if (s === "active") void flushOutbox();
    });
    const timer = setInterval(() => {
      if (useOutbox.getState().items.some((i) => !i.error)) void flushOutbox();
    }, 60_000);
    const unsubscribeTaps = listenNotificationTaps();
    return () => {
      unsubscribeNet();
      appSub.remove();
      clearInterval(timer);
      unsubscribeTaps();
    };
  }, [status]);

  return null;
}

function Shell() {
  const { scheme, colors } = useTheme();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Background />
      <AppLockGate>
        {/*
          Pilha de telas na raiz (e não `Slot`): telas como Termos de Uso, Política de Privacidade e Suporte abrem POR CIMA da tela atual, que
          continua montada embaixo. Com `Slot` a tela de baixo era descartada e o "voltar" caía sempre no Início (e quem estava preenchendo o
          cadastro perdia o que digitou ao ler os Termos). Troca entre entrada e app é só um fade.
        */}
        <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="legal/[doc]" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="support" options={{ animation: "slide_from_right" }} />
        </Stack>
        <TourController />
      </AppLockGate>
      {/* Abaixo do bloqueio por biometria (z 2000) e dos avisos (z 1000): o tutorial nunca cobre um nem o outro. */}
      <TourOverlay />
      <ToastHost />
      <ConfirmHost />
      <PaywallHost />
      <CelebrationHost />
    </>
  );
}

/**
 * Tela de erro: se uma tela quebrar, o app mostra isto em vez de ficar em branco, e o erro vai para o
 * diagnóstico. Fica FORA dos providers (tema etc.), por isso usa componentes e cores simples.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    log.error("render", error);
    void flushLogsToStorage();
    void flushErrorReports();
  }, [error]);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 14, backgroundColor: "#F6F7F9" }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color: "#0F172A", textAlign: "center" }}>Algo deu errado</Text>
      <Text style={{ fontSize: 15, color: "#475569", textAlign: "center" }}>
        Registramos o problema para corrigir. Você pode tentar de novo; seus dados estão seguros.
      </Text>
      {typeof __DEV__ !== "undefined" && __DEV__ ? (
        <Text style={{ fontSize: 12, color: "#B91C1C", textAlign: "center" }}>{String(error?.message ?? error)}</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={retry}
        style={{ backgroundColor: "#4F46E5", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 }}
      >
        <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 16 }}>Tentar de novo</Text>
      </Pressable>
      {/* Se a mesma tela quebrar de novo, "tentar de novo" não adianta: volta para o Início, que sempre abre. */}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          router.replace("/" as never);
          retry();
        }}
        style={{ paddingHorizontal: 24, paddingVertical: 12 }}
      >
        <Text style={{ color: "#4F46E5", fontWeight: "700", fontSize: 15 }}>Ir para o início</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: PERSIST_MAX_AGE, buster: "2" }}>
            <AuthProvider>
              <Shell />
            </AuthProvider>
          </PersistQueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

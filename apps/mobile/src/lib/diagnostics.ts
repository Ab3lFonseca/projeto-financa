import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "./api/endpoints";
import { formatLogText, useLogStore, type LogEntry } from "./logger";

const BATCH = 20;
let flushing = false;

/** Dados técnicos do aparelho/app que acompanham cada relatório (nada pessoal). */
export function appInfo(): { version: string; platform: "ios" | "android" | "web"; osVersion?: string } {
  const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
  return {
    version: String(Constants.expoConfig?.version ?? "0.0.0").slice(0, 20),
    platform,
    osVersion: Platform.OS === "web" ? undefined : String(Platform.Version).slice(0, 30),
  };
}

/**
 * Envia ao servidor os erros/avisos ainda não enviados (em lotes de 20). Só roda com sessão aberta e se o
 * usuário não tiver desligado o envio. Nunca lança nem registra a própria falha (evita laço de erros):
 * se falhar, os eventos continuam pendentes para a próxima tentativa.
 */
export async function flushErrorReports(): Promise<number> {
  if (flushing || !useLogStore.getState().reportsEnabled) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (;;) {
      const pending = useLogStore.getState().entries.filter((e) => !e.sent && (e.level === "error" || e.level === "warn")).slice(0, BATCH);
      if (pending.length === 0) break;
      await api.diagnostics.report({
        app: appInfo(),
        events: pending.map(toEvent),
      });
      useLogStore.getState().markSent(pending.map((e) => e.id));
      sent += pending.length;
    }
  } catch {
    /* sem rede ou sem sessão: fica para depois */
  } finally {
    flushing = false;
  }
  return sent;
}

function toEvent(e: LogEntry) {
  return {
    at: e.at,
    level: e.level as "error" | "warn",
    source: e.source,
    message: e.count > 1 ? `${e.message} (×${e.count})`.slice(0, 500) : e.message,
    stack: e.stack,
    screen: e.screen,
    context: e.context,
  };
}

/** Texto do diagnóstico para compartilhar com quem for investigar. */
export function buildDiagnosticText(): string {
  const info = appInfo();
  return formatLogText(useLogStore.getState().entries, {
    app: info.version,
    plataforma: `${info.platform}${info.osVersion ? ` ${info.osVersion}` : ""}`,
    gerado: new Date().toISOString(),
  });
}

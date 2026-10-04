import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

/**
 * Registro local de eventos do app (diagnóstico). Guarda os últimos eventos no aparelho para você
 * consultar/compartilhar em Configurações → Diagnóstico e, se permitido, envia os ERROS ao servidor
 * (lib/diagnostics.ts), onde caem no mesmo log da API.
 *
 * Regra de ouro: nada pessoal entra aqui. Mensagens e contexto passam por `scrub` (e-mail, token, valores em
 * reais, números longos) e quem registra deve mandar só dados técnicos (rota, status, código, id da requisição).
 */

export type LogLevel = "info" | "warn" | "error";
export type LogContext = Record<string, string | number | boolean | null>;

export type LogEntry = {
  id: string;
  at: string;
  level: LogLevel;
  source: string;
  message: string;
  stack?: string;
  screen?: string;
  context?: LogContext;
  /** Quantas vezes o mesmo evento se repetiu em sequência. */
  count: number;
  /** Já enviado ao servidor? */
  sent: boolean;
};

export const MAX_ENTRIES = 300;
const MAX_MESSAGE = 500;
const MAX_STACK = 4000;
const STORAGE_KEY = "app-log-v1";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]{10,}/gi;
const MONEY = /R\$\s?-?[\d.,]+/g;
const LONG_NUMBER = /\d{9,}/g;

/** Remove de texto livre o que não pode ser registrado. */
export function scrub(text: string): string {
  return text
    .replace(BEARER, "Bearer [token]")
    .replace(JWT, "[token]")
    .replace(EMAIL, "[email]")
    .replace(MONEY, "R$ [valor]")
    .replace(LONG_NUMBER, "[numero]");
}

let currentScreen: string | undefined;
/** Informa em que tela o usuário está (acompanha cada erro). */
export function setCurrentScreen(path: string | undefined): void {
  currentScreen = path;
}

type LogState = {
  entries: LogEntry[];
  /** Enviar erros ao servidor (técnicos, sem dados pessoais). */
  reportsEnabled: boolean;
  loaded: boolean;
  add(entry: Omit<LogEntry, "id" | "count" | "sent">): void;
  markSent(ids: string[]): void;
  clear(): void;
  setReportsEnabled(value: boolean): void;
  load(): Promise<void>;
};

let seq = 0;
const newId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useLogStore = create<LogState>((set, get) => ({
  entries: [],
  reportsEnabled: true,
  loaded: false,

  add: (entry) => {
    set((s) => {
      const last = s.entries[s.entries.length - 1];
      if (last && last.level === entry.level && last.source === entry.source && last.message === entry.message) {
        // Mesmo evento em sequência (ex.: erro de render repetido): só conta, não enche o buffer.
        const merged = { ...last, count: last.count + 1, at: entry.at };
        return { entries: [...s.entries.slice(0, -1), merged] };
      }
      const next = [...s.entries, { ...entry, id: newId(), count: 1, sent: false }];
      return { entries: next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next };
    });
    scheduleSave(get);
  },

  markSent: (ids) => {
    const set_ = new Set(ids);
    set((s) => ({ entries: s.entries.map((e) => (set_.has(e.id) ? { ...e, sent: true } : e)) }));
    scheduleSave(get);
  },

  clear: () => {
    set({ entries: [] });
    scheduleSave(get);
  },

  setReportsEnabled: (reportsEnabled) => {
    set({ reportsEnabled });
    scheduleSave(get);
  },

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { entries?: LogEntry[]; reportsEnabled?: boolean };
        // Mescla: erros ocorridos antes de o carregamento terminar não podem se perder.
        const merged = [...(saved.entries ?? []), ...get().entries].sort((a, b) => a.at.localeCompare(b.at));
        set({ entries: merged.slice(-MAX_ENTRIES), reportsEnabled: saved.reportsEnabled ?? true });
      }
    } catch {
      /* armazenamento indisponível: segue só em memória */
    }
    set({ loaded: true });
  },
}));

function scheduleSave(get: () => LogState) {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveNow(get());
  }, 1000);
}

async function saveNow(state: Pick<LogState, "entries" | "reportsEnabled">) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: state.entries, reportsEnabled: state.reportsEnabled }));
  } catch {
    /* não deixa o registro de erros virar fonte de erro */
  }
}

/** Grava já (usado em testes e ao ir para segundo plano). */
export async function flushLogsToStorage(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await saveNow(useLogStore.getState());
}

function cleanContext(context?: LogContext): LogContext | undefined {
  if (!context) return undefined;
  const out: LogContext = {};
  for (const [k, v] of Object.entries(context).slice(0, 12)) out[k.slice(0, 40)] = typeof v === "string" ? scrub(v).slice(0, 200) : v;
  return out;
}

function record(level: LogLevel, source: string, input: unknown, context?: LogContext) {
  let message: string;
  let stack: string | undefined;
  if (input instanceof Error) {
    message = `${input.name}: ${input.message}`;
    stack = input.stack;
  } else if (typeof input === "string") {
    message = input;
  } else {
    try {
      message = JSON.stringify(input) ?? String(input);
    } catch {
      message = String(input);
    }
  }
  useLogStore.getState().add({
    at: new Date().toISOString(),
    level,
    source: source.slice(0, 40),
    message: scrub(message).slice(0, MAX_MESSAGE),
    stack: stack ? scrub(stack).slice(0, MAX_STACK) : undefined,
    screen: currentScreen?.slice(0, 100),
    context: cleanContext(context),
  });
}

export const log = {
  info: (source: string, message: unknown, context?: LogContext) => record("info", source, message, context),
  warn: (source: string, message: unknown, context?: LogContext) => record("warn", source, message, context),
  error: (source: string, message: unknown, context?: LogContext) => record("error", source, message, context),
};

let installed = false;

/**
 * Captura o que escapa de qualquer tratamento: exceções não tratadas, promessas rejeitadas e
 * `console.error`. Seguro chamar mais de uma vez.
 */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  // Exceções não tratadas (React Native).
  const errorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler?: () => (e: Error, fatal?: boolean) => void; setGlobalHandler?: (h: (e: Error, fatal?: boolean) => void) => void } }).ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      record("error", "js", error, { fatal: Boolean(isFatal) });
      void flushLogsToStorage(); // pode ser o último suspiro do app
      previous?.(error, isFatal);
    });
  }

  // Promessas rejeitadas sem tratamento: o Hermes de produção as engole em silêncio.
  const isDev = typeof __DEV__ !== "undefined" && __DEV__;
  const hermes = (globalThis as { HermesInternal?: { enablePromiseRejectionTracker?: (o: { allRejections: boolean; onUnhandled: (id: number, e: unknown) => void }) => void } }).HermesInternal;
  if (!isDev && hermes?.enablePromiseRejectionTracker) {
    hermes.enablePromiseRejectionTracker({ allRejections: true, onUnhandled: (_id, e) => record("error", "promise", e instanceof Error ? e : String(e)) });
  }

  // Web.
  const w = (globalThis as unknown as { window?: { addEventListener?: (t: string, h: (e: never) => void) => void } }).window;
  if (w?.addEventListener) {
    w.addEventListener("error", ((e: { error?: unknown; message?: string }) => record("error", "js", e.error ?? e.message ?? "erro desconhecido")) as never);
    w.addEventListener("unhandledrejection", ((e: { reason?: unknown }) => record("error", "promise", e.reason instanceof Error ? e.reason : String(e.reason))) as never);
  }

  // console.error (inclui os avisos de erro do React). Sem recursão e preservando o comportamento original.
  const original = console.error.bind(console);
  let inside = false;
  console.error = (...args: unknown[]) => {
    if (!inside) {
      inside = true;
      try {
        record("error", "console", args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === "string" ? a : safeString(a))).join(" "));
      } finally {
        inside = false;
      }
    }
    original(...args);
  };
}

function safeString(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Texto para compartilhar/anexar: cabeçalho técnico + eventos do mais antigo ao mais recente. */
export function formatLogText(entries: LogEntry[], header: Record<string, string>): string {
  const lines = ["# Diagnóstico do app Finança", ...Object.entries(header).map(([k, v]) => `# ${k}: ${v}`), ""];
  for (const e of entries) {
    const when = e.at.replace("T", " ").replace(/\.\d+Z$/, "Z");
    lines.push(`[${when}] ${e.level.toUpperCase()} ${e.source}${e.screen ? ` (${e.screen})` : ""}${e.count > 1 ? ` ×${e.count}` : ""}: ${e.message}`);
    if (e.context) lines.push(`    contexto: ${JSON.stringify(e.context)}`);
    if (e.stack) lines.push(...e.stack.split("\n").map((l) => `    ${l}`));
  }
  return lines.join("\n") + "\n";
}

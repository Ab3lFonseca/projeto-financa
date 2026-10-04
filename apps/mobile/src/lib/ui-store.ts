import { create } from "zustand";

export type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; message: string; tone: ToastTone };

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Ação destrutiva: botão em vermelho. */
  destructive?: boolean;
};

type UiState = {
  toasts: ToastItem[];
  confirm: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  push: (message: string, tone: ToastTone) => void;
  dismiss: (id: number) => void;
  ask: (options: ConfirmOptions) => Promise<boolean>;
  answer: (ok: boolean) => void;
};

let nextId = 1;

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  confirm: null,
  push: (message, tone) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone }] }));
    setTimeout(() => get().dismiss(id), tone === "error" ? 5000 : 3000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  ask: (options) => new Promise<boolean>((resolve) => set({ confirm: { ...options, resolve } })),
  answer: (ok) => {
    get().confirm?.resolve(ok);
    set({ confirm: null });
  },
}));

/** Avisos rápidos (substitui alert/Toast nativo, que variam entre plataformas). */
export const toast = {
  success: (message: string) => useUiStore.getState().push(message, "success"),
  error: (message: string) => useUiStore.getState().push(message, "error"),
  info: (message: string) => useUiStore.getState().push(message, "info"),
};

/** Diálogo de confirmação que funciona igual em iOS, Android e web. */
export const confirmDialog = (options: ConfirmOptions) => useUiStore.getState().ask(options);

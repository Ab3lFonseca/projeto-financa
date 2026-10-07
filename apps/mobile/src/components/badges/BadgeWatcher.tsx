import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { api } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useBadgeGate } from "@/lib/badgeGate";
import { planCelebrations } from "@/lib/badges";
import { celebrate } from "@/lib/celebrate";
import { BadgeArt } from "./BadgeArt";

/** Depois de salvar algo, espera um instante (várias gravações seguidas viram uma conferência só). */
const AFTER_SAVE_MS = 1500;
/** Voltar ao app confere de novo, no máximo uma vez por este tempo. */
const REFOCUS_MS = 30_000;

/**
 * Confere as insígnias e comemora na tela, na hora, o que for novo: ao abrir o app, ao voltar para ele e logo depois de salvar qualquer coisa
 * (lançamento, meta, orçamento...). O servidor é quem decide o que foi conquistado; aqui só se mostra. Sem rede, não faz nada (tenta no próximo gatilho).
 */
export function BadgeWatcher() {
  const qc = useQueryClient();
  const { me } = useAuth();
  const firstName = me?.profile.displayName?.trim().split(/\s+/)[0] ?? null;
  const nameRef = useRef(firstName);
  nameRef.current = firstName;
  const running = useRef(false);
  const shown = useRef(new Set<string>());
  const lastCheck = useRef(0);

  const check = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    lastCheck.current = Date.now();
    try {
      const res = await qc.fetchQuery({ queryKey: ["badges"], queryFn: api.badges.list, staleTime: 0 });
      const plans = planCelebrations(res.items, nameRef.current).filter((p) => !shown.current.has(p.key));
      for (const p of plans) {
        shown.current.add(p.key);
        celebrate({
          kind: p.kind === "welcome" ? "welcome" : "badge",
          title: p.title,
          message: p.message,
          emblem: <BadgeArt tier={Math.max(1, Math.min(6, p.tier)) as 1 | 2 | 3 | 4 | 5 | 6} icon={p.icon} size={150} animated />,
          actionLabel: "Ver minhas insígnias",
          onAction: () => router.push("/badges" as never),
        });
      }
      if (plans.length > 0) {
        // Já mostrou: marca como vista (não repete em outro aparelho nem na próxima abertura) e atualiza a galeria.
        await api.badges.seen().catch(() => undefined);
        void qc.invalidateQueries({ queryKey: ["badges"] });
      }
    } catch {
      /* sem rede ou erro do servidor: tenta de novo no próximo gatilho */
    } finally {
      running.current = false;
      useBadgeGate.getState().markChecked();
    }
  }, [qc]);

  // Ao abrir.
  useEffect(() => {
    const t = setTimeout(() => void check(), 300);
    return () => clearTimeout(t);
  }, [check]);

  // Ao voltar para o app.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - lastCheck.current > REFOCUS_MS) void check();
    });
    return () => sub.remove();
  }, [check]);

  // Depois de salvar qualquer coisa com sucesso.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = qc.getMutationCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;
      clearTimeout(timer);
      timer = setTimeout(() => void check(), AFTER_SAVE_MS);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [qc, check]);

  return null;
}

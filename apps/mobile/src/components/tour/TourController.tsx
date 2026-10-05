import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import { api } from "@/lib/api/endpoints";
import { useAuth } from "@/lib/auth/AuthProvider";
import { log } from "@/lib/logger";
import { isMainPath } from "@/lib/tour/steps";
import { useTourStore } from "@/lib/tour/store";

const doneKey = (userId: string) => `tour-done-v1:${userId}`;

/**
 * Decide quando o tutorial começa sozinho e grava quando ele termina.
 *  - Começa uma vez, para quem ainda não concluiu (`profile.onboardingCompleted` da conta) e não marcou como concluído neste
 *    aparelho, só nas telas principais e depois de aceitar os termos.
 *  - Ao concluir ou pular, marca na conta (vale em todos os aparelhos) e neste aparelho (vale mesmo se a rede falhar).
 */
export function TourController() {
  const { status, me, refreshMe } = useAuth();
  const pathname = usePathname();
  const active = useTourStore((s) => s.active);
  const ended = useTourStore((s) => s.ended);
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "signedIn" || !me || active || me.consentRequired || me.profile.onboardingCompleted) return;
    if (startedFor.current === me.id || !isMainPath(pathname)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void AsyncStorage.getItem(doneKey(me.id)).then((done) => {
      if (!alive || done) return;
      // Um instante para a tela inicial terminar de aparecer antes do tutorial escurecer tudo.
      timer = setTimeout(() => {
        if (!alive) return;
        startedFor.current = me.id;
        useTourStore.getState().start("auto");
      }, 800);
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [status, me, active, pathname]);

  useEffect(() => {
    if (!ended || !me) return;
    useTourStore.getState().acknowledge();
    const userId = me.id;
    const alreadyOnAccount = me.profile.onboardingCompleted;
    void (async () => {
      try {
        await AsyncStorage.setItem(doneKey(userId), "1");
        if (!alreadyOnAccount) {
          await api.me.update({ onboardingCompleted: true });
          await refreshMe();
        }
      } catch (err) {
        // Sem rede: o aviso deste aparelho já impede que o tutorial reapareça; a conta é atualizada na próxima vez que concluir.
        log.warn("tour", err);
      }
    })();
  }, [ended, me, refreshMe]);

  return null;
}

import { router, usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import ReAnimated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/Button";
import { IconBadge } from "@/components/ui/Layout";
import { Text } from "@/components/ui/Text";
import { padRect, placeCard, sameRect, type Rect } from "@/lib/tour/geometry";
import { measureTarget, revealTarget } from "@/lib/tour/registry";
import { TOUR_STEPS } from "@/lib/tour/steps";
import { useTourStore } from "@/lib/tour/store";
import { useTheme } from "@/theme/ThemeProvider";

const PAD = 8; // folga do destaque em volta do elemento
const MASK = "rgba(6,8,16,0.68)"; // escurece o resto da tela (igual em qualquer tema, para o foco sempre aparecer)
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/** Tutorial por cima do app: escurece a tela, destaca o elemento real da etapa e mostra o que ele faz. */
export function TourOverlay() {
  const active = useTourStore((s) => s.active);
  return active ? <TourLayer /> : null;
}

function TourLayer() {
  const index = useTourStore((s) => s.index);
  const phase = useTourStore((s) => s.phase);
  const { next, back, skip, close } = useTourStore.getState();
  const step = TOUR_STEPS[index]!;
  const total = TOUR_STEPS.length;
  const isLast = index === total - 1;
  const win = useWindowDimensions();
  const pathname = usePathname();
  const { colors, radius } = useTheme();
  const reduceMotion = useReduceMotion();
  const duration = reduceMotion ? 0 : 280;

  const [rect, setRect] = useState<Rect | null>(null); // posição real do elemento (sem a folga)
  const [ready, setReady] = useState(false); // já procuramos o elemento desta etapa
  const [cardHeight, setCardHeight] = useState(260);
  const cardRef = useRef<View>(null);

  // 1) Ao mudar de etapa: vai para a tela certa, espera o elemento aparecer e mede.
  useEffect(() => {
    if (phase !== "steps") {
      setRect(null);
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    void (async () => {
      if ((pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname) !== step.route) router.navigate(step.route as never);
      if (!step.target) {
        setRect(null);
        setReady(true);
        return;
      }
      let found: Rect | null = null;
      const deadline = Date.now() + 2500;
      while (!cancelled && Date.now() < deadline) {
        revealTarget(step.target);
        found = await measureTarget(step.target);
        if (found) break;
        await sleep(90);
      }
      if (cancelled) return;
      if (found) {
        await sleep(reduceMotion ? 30 : 220); // dá tempo da rolagem e da animação de entrada da tela terminarem
        const settled = await measureTarget(step.target);
        if (!cancelled && settled) found = settled;
      }
      if (cancelled) return;
      setRect(found); // sem achar (tela diferente, ainda carregando): o cartão fica centralizado, sem destaque
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // `pathname` só importa no instante da troca de etapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, phase]);

  // 2) Enquanto a etapa está aberta, acompanha mudanças de layout (rolagem, teclado, tela redimensionada).
  useEffect(() => {
    if (phase !== "steps" || !step.target || !ready) return;
    const id = step.target;
    const timer = setInterval(() => {
      void measureTarget(id).then((r) => {
        if (r) setRect((old) => (sameRect(old, r) ? old : r));
      });
    }, 500);
    return () => clearInterval(timer);
  }, [phase, step.target, ready]);

  // 3) O buraco no escurecimento (e o anel) deslizam suavemente de um elemento para o outro.
  const hole = useRef({ x: new Animated.Value(win.width / 2), y: new Animated.Value(win.height / 2), w: new Animated.Value(0), h: new Animated.Value(0) }).current;
  const shown = rect ? padRect(rect, PAD, win) : null;
  useEffect(() => {
    const to = shown ?? { x: win.width / 2, y: win.height / 2, width: 0, height: 0 };
    const go = (v: Animated.Value, value: number) => Animated.timing(v, { toValue: value, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    Animated.parallel([go(hole.x, to.x), go(hole.y, to.y), go(hole.w, to.width), go(hole.h, to.height)]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.x, shown?.y, shown?.width, shown?.height, win.width, win.height, duration]);

  // 4) O cartão também desliza para o lugar novo.
  const place = placeCard(shown, win, { height: cardHeight });
  const pos = useRef({ top: new Animated.Value(place.top), left: new Animated.Value(place.left) }).current;
  useEffect(() => {
    const go = (v: Animated.Value, value: number) => Animated.timing(v, { toValue: value, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    Animated.parallel([go(pos.top, place.top), go(pos.left, place.left)]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.top, place.left, duration]);

  // 5) Teclado (web): setas navegam, Esc fecha, Tab fica preso no cartão. A cada etapa o foco vai para o cartão.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const card = cardRef.current as unknown as HTMLElement | null;
    if (ready) card?.focus?.();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (useTourStore.getState().phase === "done") close();
        else skip();
      } else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
      else if (e.key === "Tab" && card) {
        const items = [...card.querySelectorAll<HTMLElement>('[role="button"],button,[tabindex="0"]')].filter((el) => el.getAttribute("aria-disabled") !== "true");
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const current = document.activeElement;
        if (e.shiftKey && (current === first || current === card)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && current === last) {
          e.preventDefault();
          first.focus();
        } else if (!card.contains(current)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, phase, ready]);

  const done = phase === "done";
  return (
    <View
      pointerEvents="auto"
      style={[StyleSheet.absoluteFill, { zIndex: 900 }]}
      {...(Platform.OS === "web" ? ({ role: "dialog", "aria-modal": true, "aria-label": "Tutorial do app" } as object) : null)}
    >
      {/* Escurecimento em volta do elemento (quatro faixas) */}
      <Animated.View style={{ position: "absolute", left: 0, right: 0, top: 0, height: hole.y, backgroundColor: MASK }} />
      <Animated.View style={{ position: "absolute", left: 0, right: 0, top: Animated.add(hole.y, hole.h), bottom: 0, backgroundColor: MASK }} />
      <Animated.View style={{ position: "absolute", left: 0, top: hole.y, width: hole.x, height: hole.h, backgroundColor: MASK }} />
      <Animated.View style={{ position: "absolute", top: hole.y, left: Animated.add(hole.x, hole.w), right: 0, height: hole.h, backgroundColor: MASK }} />
      {/* Anel de destaque (também bloqueia toques no elemento: o tutorial guia, não executa) */}
      <Animated.View
        pointerEvents="auto"
        style={{
          position: "absolute",
          left: hole.x,
          top: hole.y,
          width: hole.w,
          height: hole.h,
          borderRadius: 16,
          borderWidth: shown ? 2 : 0,
          borderColor: colors.accent,
          shadowColor: colors.accent,
          shadowOpacity: 0.55,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 0 },
        }}
      />

      <Animated.View
        ref={cardRef}
        focusable
        {...({ tabIndex: -1 } as object)}
        style={{ position: "absolute", top: pos.top, left: pos.left, width: place.width, opacity: ready ? 1 : 0, outlineStyle: "none" as never }}
        pointerEvents={ready ? "auto" : "none"}
        onLayout={(e) => setCardHeight(Math.round(e.nativeEvent.layout.height))}
      >
        <ReAnimated.View
          key={done ? "done" : step.id}
          entering={reduceMotion ? undefined : done ? ZoomIn.duration(320) : FadeInDown.duration(240)}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 18,
            gap: 12,
            shadowColor: "#000",
            shadowOpacity: 0.3,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 12,
          }}
        >
          {done ? <DoneCard onClose={() => { close(); router.navigate("/" as never); }} /> : <StepCard index={index} total={total} isLast={isLast} onNext={next} onBack={back} onSkip={skip} />}
        </ReAnimated.View>
      </Animated.View>
    </View>
  );
}

function StepCard({ index, total, isLast, onNext, onBack, onSkip }: { index: number; total: number; isLast: boolean; onNext: () => void; onBack: () => void; onSkip: () => void }) {
  const { colors } = useTheme();
  const step = TOUR_STEPS[index]!;
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <IconBadge icon={step.icon} color={colors.accent} size={40} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text variant="caption" tone="muted" weight="700" accessibilityLiveRegion="polite">
            Etapa {index + 1} de {total}
          </Text>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: index + 1 }} style={{ flexDirection: "row", gap: 3 }}>
            {Array.from({ length: total }, (_, i) => (
              <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= index ? colors.accent : colors.border }} />
            ))}
          </View>
        </View>
      </View>
      <Text variant="heading" accessibilityRole="header">
        {step.title}
      </Text>
      <Text>{step.body}</Text>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 10, borderRadius: 12, backgroundColor: colors.accentSoft }}>
        <Icon name="lightbulb" size={16} color={colors.accent} />
        <Text variant="bodySm" style={{ flex: 1 }}>
          {step.why}
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
        {isLast ? <View /> : <Button label="Pular tutorial" variant="ghost" size="sm" fullWidth={false} onPress={onSkip} />}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {index > 0 ? <Button label="Voltar" variant="secondary" size="sm" fullWidth={false} onPress={onBack} /> : null}
          <Button label={isLast ? "Concluir" : "Próximo"} size="sm" fullWidth={false} onPress={onNext} />
        </View>
      </View>
    </>
  );
}

function DoneCard({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
        <Icon name="party-popper" size={30} color={colors.accent} />
      </View>
      <Text variant="title" align="center" accessibilityRole="header" accessibilityLiveRegion="polite">
        Tudo pronto!
      </Text>
      <Text align="center" tone="muted">
        Agora é com você: registre o seu primeiro lançamento, crie uma conta ou conecte um banco. Explore à vontade, os seus dados são só seus.
      </Text>
      <Text variant="caption" align="center" tone="faint">
        Para rever este passo a passo, abra Mais → Tutorial.
      </Text>
      <Button label="Explorar o app" icon="rocket" size="md" onPress={onClose} />
    </View>
  );
}

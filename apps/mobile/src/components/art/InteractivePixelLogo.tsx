import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { ambientShift, approach, HOVER_RADIUS, hoverShift, seeded, type PixelCell, type Pointer } from "./pixelShapes";

/** Cor e opacidade de cada cubo (já com o tema aplicado), na mesma ordem de `cells`. */
export type CellPaint = { fill: string; alpha: number };

/** Folga em volta da logo (em unidades dela): é por onde os cubos empurrados pelo mouse podem sair sem serem cortados. */
const PAD = 0.32;
/** Fora disto (em unidades da logo) o valor já é "parado" e o quadro não precisa mais ser redesenhado. */
const SETTLED = { move: 0.0004, rotate: 0.04, glow: 0.004 };

/** Resolução máxima de cada camada (em pixels de lado): a imagem é grande e já sai desfocada, então não vale gastar memória além disto. */
const MAX_CANVAS_SIDE = 1800;
/** Nos celulares o movimento próprio roda a ~30 quadros por segundo, para poupar bateria. */
const AMBIENT_FRAME_MS = 30;

/**
 * A logo em pixels para a WEB: desenhada em `canvas` (centenas de cubos sem pesar). Com mouse, fica parada e, quando ele passa por cima, os cubos
 * perto do cursor são empurrados, giram e acendem, e depois assentam de volta. Em tela de toque (celular, sem mouse) os cubos alternam sozinhos,
 * subindo e descendo, e o dedo arrastado também os empurra. Não recebe toques (o mouse é lido na janela inteira): nada fica por cima do conteúdo.
 */
export function InteractivePixelLogo({ cells, paint, box, base, peak }: { cells: PixelCell[]; paint: CellPaint[]; box: number; base: number; peak: number }) {
  const reduce = useReducedMotion();
  const solidRef = useRef<HTMLCanvasElement>(null);
  const shardRef = useRef<HTMLCanvasElement>(null);
  // Um número fixo por cubo (0..1) para variar força e giro; sorteado uma vez, então a imagem é sempre a mesma.
  const noise = useMemo(() => {
    const rand = seeded(7);
    return cells.map(() => rand());
  }, [cells]);

  useEffect(() => {
    const solid = solidRef.current;
    const shard = shardRef.current;
    if (!solid || !shard) return;
    const solidCtx = solid.getContext("2d");
    const shardCtx = shard.getContext("2d");
    if (!solidCtx || !shardCtx) return;

    // Resolução limitada: a imagem é grande e já sai desfocada. A camada é esticada pelo navegador até o tamanho de tela.
    const cssSide = box * (1 + 2 * PAD);
    const scale = Math.max(0.5, Math.min(window.devicePixelRatio || 1, 1.5, MAX_CANVAS_SIDE / cssSide));
    const px = Math.round(cssSide * scale);
    solid.width = shard.width = px;
    solid.height = shard.height = px;
    const k = px / (1 + 2 * PAD); // pixels do canvas por unidade da logo
    const n = cells.length;
    const cur = new Float32Array(n * 4); // por cubo, vindo do mouse: dx, dy, giro, brilho
    const amb = new Float32Array(n * 3); // por cubo, movimento próprio (celular): dy, giro, brilho
    // Sem mouse (celular/tablet): os cubos alternam sozinhos. Com mouse, ficam parados até o cursor passar por cima.
    const ambient = !reduce && window.matchMedia?.("(hover: none), (pointer: coarse)").matches === true;

    const draw = () => {
      solidCtx.clearRect(0, 0, px, px);
      shardCtx.clearRect(0, 0, px, px);
      for (let i = 0; i < n; i++) {
        const cell = cells[i]!;
        const p = paint[i]!;
        const glow = Math.min(1, cur[i * 4 + 3]! + amb[i * 3 + 2]!);
        const ctx = cell.shard ? shardCtx : solidCtx;
        const side = cell.size * k * (1 + glow * 0.3);
        const angle = ((cell.rotate + cur[i * 4 + 2]! + amb[i * 3 + 1]!) * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        // Gira em torno do centro do cubo: a matriz já leva o centro para a posição final (com o empurrão do mouse e o balanço próprio).
        ctx.setTransform(cos, sin, -sin, cos, (PAD + cell.x + cell.size / 2 + cur[i * 4]!) * k, (PAD + cell.y + cell.size / 2 + cur[i * 4 + 1]! + amb[i * 3]!) * k);
        ctx.globalAlpha = Math.min(1, p.alpha * (base + glow * (peak - base)));
        ctx.fillStyle = p.fill;
        ctx.fillRect(-side / 2, -side / 2, side, side);
      }
      solidCtx.setTransform(1, 0, 0, 1, 0, 0);
      shardCtx.setTransform(1, 0, 0, 1, 0, 0);
    };

    draw();
    if (reduce) return; // quem pediu menos movimento vê a imagem parada

    let pointer: Pointer | null = null;
    let moving = false;
    let raf = 0;
    let last = 0;

    let idleTimer = 0;
    const step = (t: number) => {
      raf = 0;
      // Tela escondida (aba que continua montada atrás de outra): não desenha nada e só confere de vez em quando se voltou. Poupa bateria.
      if (ambient && (solid.getClientRects().length === 0 || solid.closest('[aria-hidden="true"]') !== null)) {
        last = 0;
        idleTimer = window.setTimeout(wake, 700);
        return;
      }
      // Movimento próprio: limita os quadros (sem avançar `last`, para o tempo continuar certo no quadro seguinte).
      if (ambient && last && t - last < AMBIENT_FRAME_MS) {
        raf = requestAnimationFrame(step);
        return;
      }
      const dt = last ? (t - last) / 1000 : 1 / 60;
      last = t;
      moving = false;
      for (let i = 0; i < n; i++) {
        const target = hoverShift(cells[i]!, noise[i]!, pointer);
        const at = i * 4;
        cur[at] = approach(cur[at]!, target.dx, dt);
        cur[at + 1] = approach(cur[at + 1]!, target.dy, dt);
        cur[at + 2] = approach(cur[at + 2]!, target.rotate, dt);
        cur[at + 3] = approach(cur[at + 3]!, target.glow, dt);
        if (Math.abs(cur[at]!) > SETTLED.move || Math.abs(cur[at + 1]!) > SETTLED.move || Math.abs(cur[at + 2]!) > SETTLED.rotate || cur[at + 3]! > SETTLED.glow) moving = true;
        if (ambient) {
          const a = ambientShift(cells[i]!, noise[i]!, t / 1000);
          amb[i * 3] = a.dy;
          amb[i * 3 + 1] = a.rotate;
          amb[i * 3 + 2] = a.glow;
        }
      }
      if (!moving) cur.fill(0); // assentou de vez: sem restos de números minúsculos
      draw();
      if (ambient || moving || pointer) raf = requestAnimationFrame(step);
      else last = 0;
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };

    const onMove = (e: PointerEvent) => {
      const r = solid.getBoundingClientRect();
      if (r.width === 0) {
        pointer = null; // tela escondida (outra aba do app): nada a animar
        return;
      }
      const x = ((e.clientX - r.left) / r.width) * (1 + 2 * PAD) - PAD;
      const y = ((e.clientY - r.top) / r.height) * (1 + 2 * PAD) - PAD;
      const over = x > -HOVER_RADIUS && x < 1 + HOVER_RADIUS && y > -HOVER_RADIUS && y < 1 + HOVER_RADIUS;
      const wasOver = pointer !== null;
      pointer = over ? { x, y } : null;
      if (over || wasOver || moving) wake();
    };
    const release = () => {
      if (pointer || moving) {
        pointer = null;
        wake();
      }
    };
    const onTouchEnd = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") release(); // dedo levantado: o "mouse" some
    };

    if (ambient) wake(); // celular: começa a se mexer já, sem esperar toque
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onTouchEnd, { passive: true });
    window.addEventListener("pointercancel", release, { passive: true });
    window.addEventListener("blur", release);
    document.documentElement.addEventListener("mouseleave", release);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onTouchEnd);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
      document.documentElement.removeEventListener("mouseleave", release);
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(idleTimer);
    };
  }, [cells, paint, box, base, peak, noise, reduce]);

  const side = box * (1 + 2 * PAD);
  const layer = { position: "absolute", left: -box * PAD, top: -box * PAD, width: side, height: side, pointerEvents: "none" } as const;
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: box, height: box, left: "50%", top: "50%", marginLeft: -box / 2, marginTop: -box / 2 }}>
      {/* Duas camadas com desfoques diferentes: o corpo da logo bem suave e os estilhaços mais nítidos, como antes. */}
      <canvas ref={solidRef} style={{ ...layer, filter: "blur(3.2px)" }} />
      <canvas ref={shardRef} style={{ ...layer, filter: "blur(1px)" }} />
    </View>
  );
}

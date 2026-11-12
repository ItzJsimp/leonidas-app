import { useEffect, useRef } from "react";
import { observeResize } from "~/lib/observeResize";
import { createHeroDots, stepHeroDots } from "./heroDots";

// 30 frames a second is plenty for a slow drift and halves the cost.
const FRAME_MS = 1000 / 30;

// The soft sprite is drawn this many dot radii wide, so the edge fades out.
const HALO = 3;
const SPRITE_PX = 64;

/**
 * Slow soft red dots behind every chat, dimmer behind an active chat. They
 * always drift (Jake's choice: the drift is slow, so it ignores the system
 * reduced-motion setting). The browser stops animation frames in a hidden
 * window, so it costs nothing there.
 */
export function DraftHeroDots({ dim = false }: { readonly dim?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dots = createHeroDots();
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = SPRITE_PX;
    const spriteCtx = sprite.getContext("2d");
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const dot of dots) {
        const size = dot.r * HALO * 2;
        ctx.globalAlpha = dot.alpha;
        ctx.drawImage(sprite, dot.x * width - size / 2, dot.y * height - size / 2, size, size);
      }
    };
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      // A long gap (tab came back) must not make the dots jump.
      stepHeroDots(dots, Math.min(now - last, 100) / 1000);
      last = now;
      draw();
    };
    const stop = () => cancelAnimationFrame(frame);
    const start = () => {
      stop();
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      // shortcut: 1x pixel ratio, soft dots do not need more, upgrade if they look blocky.
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width;
      canvas.height = height;
      if (spriteCtx) {
        // A soft-edged dot: a black fade as the shape, then the theme color
        // (from `text-primary`) painted into it.
        const half = SPRITE_PX / 2;
        const fade = spriteCtx.createRadialGradient(half, half, 0, half, half, half);
        fade.addColorStop(0, "rgb(0 0 0)");
        fade.addColorStop(0.25, "rgb(0 0 0 / 0.6)");
        fade.addColorStop(1, "rgb(0 0 0 / 0)");
        spriteCtx.globalCompositeOperation = "source-over";
        spriteCtx.clearRect(0, 0, SPRITE_PX, SPRITE_PX);
        spriteCtx.fillStyle = fade;
        spriteCtx.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
        spriteCtx.globalCompositeOperation = "source-in";
        spriteCtx.fillStyle = getComputedStyle(canvas).color;
        spriteCtx.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
      }
      draw();
    };

    const unobserve = observeResize(canvas, resize);
    start();
    return () => {
      stop();
      unobserve();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 size-full text-primary transition-opacity duration-500 ${dim ? "opacity-50" : ""}`}
    />
  );
}

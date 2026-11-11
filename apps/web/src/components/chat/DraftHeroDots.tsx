import { useEffect, useRef } from "react";
import { observeResize } from "~/lib/observeResize";
import { createHeroDots, stepHeroDots } from "./heroDots";

// 30 frames a second is plenty for a slow drift and halves the cost.
const FRAME_MS = 1000 / 30;

/**
 * Slow red dots behind the new chat screen. Still when the user asks for less
 * motion. The browser stops animation frames in a hidden window, so it costs
 * nothing there.
 */
export function DraftHeroDots() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dots = createHeroDots();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let color = "";
    let frame = 0;
    let last = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      for (const dot of dots) {
        ctx.globalAlpha = dot.alpha;
        ctx.beginPath();
        ctx.arc(dot.x * width, dot.y * height, dot.r, 0, Math.PI * 2);
        ctx.fill();
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
      if (reduced.matches) {
        draw();
        return;
      }
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      // shortcut: 1x pixel ratio, soft dots do not need more, upgrade if they look blocky.
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width;
      canvas.height = height;
      // The canvas takes its color from the theme through `text-primary`.
      color = getComputedStyle(canvas).color;
      draw();
    };

    const unobserve = observeResize(canvas, resize);
    reduced.addEventListener("change", start);
    start();
    return () => {
      stop();
      unobserve();
      reduced.removeEventListener("change", start);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full text-primary"
    />
  );
}

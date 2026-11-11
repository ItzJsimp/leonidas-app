import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { readFileAsDataUrl } from "~/lib/imageCompression";
import { Button } from "../ui/button";

type Point = { readonly x: number; readonly y: number };

export function ImageMaskCanvas({
  url,
  width,
  height,
  enabled,
  alt,
  onMask,
  onBusy,
  onError,
}: {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly enabled: boolean;
  readonly alt: string;
  readonly onMask: (png: string | null) => void;
  readonly onBusy: (busy: boolean) => void;
  readonly onError: (error: unknown) => void;
}) {
  const instructions = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<Point | null>(null);
  const revision = useRef(0);
  const [cursor, setCursor] = useState<Point>({ x: width / 2, y: height / 2 });
  const radius = Math.max(1, Math.min(width, height) / 32);
  useEffect(
    () => () => {
      revision.current += 1;
    },
    [],
  );
  const publish = async () => {
    const source = canvasRef.current;
    if (!source) return;
    const version = revision.current;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The brush is unavailable in this browser.");
      context.drawImage(source, 0, 0);
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "black";
      context.fillRect(0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob || blob.size > 256 * 1024)
        throw new Error("The brush mask is too large. Clear it and paint a simpler area.");
      const data = await readFileAsDataUrl(blob);
      if (version === revision.current) onMask(data.slice(data.indexOf(",") + 1));
    } catch (error) {
      if (version === revision.current) {
        onMask(null);
        onError(error);
      }
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      if (version === revision.current) onBusy(false);
    }
  };
  const paint = (from: Point, to: Point) => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    revision.current += 1;
    onBusy(true);
    context.strokeStyle = "white";
    context.fillStyle = "white";
    context.lineWidth = radius * 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.beginPath();
    context.arc(to.x, to.y, radius, 0, Math.PI * 2);
    context.fill();
  };
  const point = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) * width) / bounds.width,
      y: ((event.clientY - bounds.top) * height) / bounds.height,
    };
  };
  const finish = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!stroke.current) return;
    stroke.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    void publish();
  };
  return (
    <div
      className="relative inline-flex max-w-full items-center justify-center"
      style={{
        width: `min(100%, ${(65 * width) / height}dvh)`,
        aspectRatio: `${width} / ${height}`,
      }}
    >
      <img src={url} alt={alt} className="size-full object-contain" />
      {enabled ? (
        <>
          <p id={instructions} className="sr-only">
            Paint the area to change. Arrow keys move the brush. Space paints. Delete clears the
            mask.
          </p>
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            tabIndex={0}
            role="application"
            aria-label="Edit mask brush"
            aria-describedby={instructions}
            className="absolute inset-0 size-full touch-none cursor-crosshair opacity-40 outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              const next = point(event);
              setCursor(next);
              stroke.current = next;
              paint(next, next);
            }}
            onPointerMove={(event) => {
              if (!stroke.current) return;
              const next = point(event);
              paint(stroke.current, next);
              setCursor(next);
              stroke.current = next;
            }}
            onPointerUp={finish}
            onPointerCancel={finish}
            onKeyDown={(event) => {
              if (event.key.startsWith("Arrow")) {
                event.preventDefault();
                setCursor((current) => ({
                  x: Math.max(
                    0,
                    Math.min(
                      width,
                      current.x +
                        (event.key === "ArrowRight" ? 16 : event.key === "ArrowLeft" ? -16 : 0),
                    ),
                  ),
                  y: Math.max(
                    0,
                    Math.min(
                      height,
                      current.y +
                        (event.key === "ArrowDown" ? 16 : event.key === "ArrowUp" ? -16 : 0),
                    ),
                  ),
                }));
              } else if (event.key === " ") {
                event.preventDefault();
                paint(cursor, cursor);
                void publish();
              } else if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                revision.current += 1;
                event.currentTarget.getContext("2d")?.clearRect(0, 0, width, height);
                onMask(null);
                onBusy(false);
              }
            }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full border-2 border-white ring-1 ring-black"
            style={{
              left: `${(cursor.x / width) * 100}%`,
              top: `${(cursor.y / height) * 100}%`,
              width: `${((radius * 2) / width) * 100}%`,
              height: `${((radius * 2) / height) * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="absolute bottom-2 end-2"
            onClick={() => {
              revision.current += 1;
              canvasRef.current?.getContext("2d")?.clearRect(0, 0, width, height);
              onMask(null);
              onBusy(false);
            }}
          >
            Clear mask
          </Button>
        </>
      ) : null}
    </div>
  );
}

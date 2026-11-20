import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const BAR_COUNT = 12;
const MIN_BAR = 4;
const MAX_BAR = 18;

export const formatPillTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * The Scribe pill, drawn in the app while the composer dictates: the same dark pill the Scribe
 * engine shows. Listening shows a level that scrolls by and the time. A click stops the take.
 */
export function ScribePill(props: {
  phase: "listening" | "writing" | "done";
  seconds: number;
  /** A 0 to 1 mic loudness, read ten times a second while listening. */
  level: () => number;
  onStop: () => void;
}) {
  const { phase, level } = props;
  const [bars, setBars] = useState<number[]>(() => Array(BAR_COUNT).fill(0));
  useEffect(() => {
    if (phase !== "listening") return;
    // Speech peaks near a third of full scale, so the read is boosted to fill the bars.
    const timer = setInterval(
      () => setBars((old) => [...old.slice(1), Math.min(1, level() * 3)]),
      100,
    );
    return () => clearInterval(timer);
  }, [phase, level]);

  return createPortal(
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-50 flex h-10.5 -translate-x-1/2 items-center gap-2.5 rounded-full border border-white/10 bg-scribe-pill px-4 font-mono text-sm font-medium whitespace-nowrap text-scribe-pill-foreground shadow-lg"
    >
      {phase === "listening" ? (
        <button
          type="button"
          aria-label="Stop dictation"
          className="flex cursor-pointer items-center gap-2.5 focus-visible:outline-none"
          onClick={props.onStop}
        >
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-destructive" />
          <span aria-hidden className="flex h-4.5 items-center gap-0.5">
            {bars.map((value, index) => (
              <i
                key={`slot-${index}`}
                data-bar=""
                className="w-0.75 rounded-sm bg-info transition-[height] duration-100"
                style={{ height: `${Math.round(MIN_BAR + value * (MAX_BAR - MIN_BAR))}px` }}
              />
            ))}
          </span>
          <span>{formatPillTime(props.seconds)}</span>
        </button>
      ) : phase === "writing" ? (
        <>
          <span
            aria-hidden
            className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-white/15 border-t-info"
          />
          Transcribing
        </>
      ) : (
        <>
          <span
            aria-hidden
            className="grid size-4.5 shrink-0 place-items-center rounded-full bg-success text-success-foreground"
          >
            <CheckIcon className="size-3" />
          </span>
          Pasted
        </>
      )}
    </div>,
    document.body,
  );
}

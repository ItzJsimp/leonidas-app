export type LimitView = "used" | "left";

const NOOP = () => {};
const LEFT_VIEW = ["left", NOOP] as const satisfies readonly [LimitView, () => void];

/** Every usage surface shows remaining quota (% left). */
export function useLimitView(): readonly [LimitView, () => void] {
  return LEFT_VIEW;
}

/** `62% used` or `38% left` for a window's used percent. */
export function limitText(usedPercent: number, view: LimitView = "left"): string {
  const used = Math.round(Math.max(0, Math.min(100, usedPercent)));
  return view === "used" ? `${used}% used` : `${100 - used}% left`;
}

/** The split needs this much window width. Below it one pane shows and the rail switches panes. */
export const SPLIT_MIN_WIDTH = 1280;
/** Below this width the rail moves into a drawer. */
export const DRAWER_BELOW_WIDTH = 728;
/** Each pane keeps at least this much width. */
const MIN_PANE_WIDTH = 360;
const RATIO_STEP = 0.02;

export type RouteKind = "thread" | "window";
export type PaneLayout = { readonly mode: "split" | "single"; readonly show: "left" | "chat" };

/** Split when it is on and the window is wide enough, else the one pane the page belongs to. */
export function paneLayout(input: {
  readonly width: number;
  readonly split: boolean;
  readonly routeKind: RouteKind;
}): PaneLayout {
  const show = input.routeKind === "thread" ? "chat" : "left";
  return input.split && input.width >= SPLIT_MIN_WIDTH
    ? { mode: "split", show }
    : { mode: "single", show };
}

/** The left pane's share of the width, held so each pane keeps its minimum. */
export function clampRatio(ratio: number, width: number): number {
  if (!Number.isFinite(ratio) || width < MIN_PANE_WIDTH * 2) return 0.5;
  const min = MIN_PANE_WIDTH / width;
  return Math.min(1 - min, Math.max(min, ratio));
}

/** One keyboard step left (-1) or right (1). */
export const stepRatio = (ratio: number, direction: 1 | -1, width: number) =>
  clampRatio(ratio + direction * RATIO_STEP, width);

/** The ratio a divider key sets, or null when the key does nothing. Home and End go to the limits. */
export function keyRatio(key: string, ratio: number, width: number): number | null {
  if (key === "ArrowLeft") return stepRatio(ratio, -1, width);
  if (key === "ArrowRight") return stepRatio(ratio, 1, width);
  if (key === "Home") return clampRatio(0, width);
  if (key === "End") return clampRatio(1, width);
  return null;
}

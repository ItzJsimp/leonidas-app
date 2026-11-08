import type { LocalModelRow } from "@t3tools/contracts";

export type TaskSize = "small" | "medium" | "large";

const byNumber = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1);

const REASON: Record<TaskSize, string> = {
  small: "The fastest installed model that fits this PC. Good for short, simple work.",
  medium: "The best-scoring installed model that fits this PC with room to spare.",
  large: "The best-scoring installed model that fits this PC. It may be slow.",
};

/**
 * The installed model to use for a task of this size. A model too big for this PC never wins.
 * Small work picks speed, large work picks quality (benchmark score), medium wants a comfortable fit first.
 */
export function pickModel(rows: ReadonlyArray<LocalModelRow>, size: TaskSize) {
  const usable = rows.filter((row) => row.installed && row.fit !== "too_big");
  const ranked = usable.toSorted((left, right) => {
    if (size === "small")
      return (
        byNumber(left.tokensPerSecond, right.tokensPerSecond) ||
        byNumber(right.sizeBytes, left.sizeBytes)
      );
    if (size === "medium" && (left.fit === "fits") !== (right.fit === "fits"))
      return left.fit === "fits" ? -1 : 1;
    return (
      byNumber(left.benchLm, right.benchLm) || byNumber(left.tokensPerSecond, right.tokensPerSecond)
    );
  });
  const best = ranked[0];
  return {
    size,
    best:
      best === undefined
        ? null
        : {
            model: best.id,
            sizeBytes: best.sizeBytes,
            fit: best.fit,
            tokensPerSecond: best.tokensPerSecond,
            benchLm: best.benchLm,
            reason: REASON[size],
          },
    installed: usable.map((row) => ({ model: row.id, fit: row.fit, loaded: row.loaded })),
  };
}

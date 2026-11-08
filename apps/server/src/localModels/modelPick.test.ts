import type { LocalModelRow } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { pickModel } from "./modelPick.ts";

const row = (id: string, over: Partial<LocalModelRow>) =>
  ({
    id,
    name: id,
    installed: true,
    loaded: false,
    sizeBytes: 4e9,
    fit: "fits",
    tokensPerSecond: null,
    benchLm: null,
    ...over,
  }) as LocalModelRow;
const rows = [
  row("fast", { tokensPerSecond: 90, benchLm: 40, sizeBytes: 2e9 }),
  row("smart", { tokensPerSecond: 20, benchLm: 70, sizeBytes: 9e9, fit: "tight" }),
  row("huge", { tokensPerSecond: 5, benchLm: 95, sizeBytes: 40e9, fit: "too_big" }),
  row("absent", { installed: false, tokensPerSecond: 200, benchLm: 99 }),
];

describe("pickModel", () => {
  it("picks the fastest fitting model for small work", () => {
    expect(pickModel(rows, "small").best?.model).toBe("fast");
  });

  it("picks the best score for large work, never one that is too big or not installed", () => {
    expect(pickModel(rows, "large").best?.model).toBe("smart");
  });

  it("wants a comfortable fit first for medium work", () => {
    expect(pickModel(rows, "medium").best?.model).toBe("fast");
  });

  it("returns no model when none is installed and usable", () => {
    expect(pickModel([rows[2]!, rows[3]!], "small").best).toBeNull();
    expect(pickModel([], "large").installed).toEqual([]);
  });
});

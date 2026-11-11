import { assert, describe, it } from "vite-plus/test";

import {
  calculateCursorCompanionPlacement,
  calculateTargetHighlight,
  DEFAULT_CURSOR_OFFSET,
  type GuideDisplayBounds,
  type GuidePoint,
  type GuideRect,
} from "./GuideGeometry.ts";

describe("GuideGeometry", () => {
  const display: GuideDisplayBounds = { x: 0, y: 0, width: 1920, height: 1080 };

  it("calculates companion placement within normal bounds", () => {
    const cursor: GuidePoint = { x: 500, y: 400 };
    const placement = calculateCursorCompanionPlacement({ cursor, display });

    assert.strictEqual(placement.pointer.x, 500 + DEFAULT_CURSOR_OFFSET.x);
    assert.strictEqual(placement.pointer.y, 400 + DEFAULT_CURSOR_OFFSET.y);
    assert.strictEqual(placement.flippedHorizontal, false);
    assert.strictEqual(placement.flippedVertical, false);
  });

  it("flips companion horizontally when near the right screen edge", () => {
    const cursor: GuidePoint = { x: 1850, y: 400 };
    const placement = calculateCursorCompanionPlacement({ cursor, display });

    assert.strictEqual(placement.flippedHorizontal, true);
    assert.isBelow(placement.pointer.x, cursor.x);
  });

  it("flips companion vertically when near the bottom screen edge", () => {
    const cursor: GuidePoint = { x: 500, y: 1050 };
    const placement = calculateCursorCompanionPlacement({ cursor, display });

    assert.strictEqual(placement.flippedVertical, true);
    assert.isBelow(placement.pointer.y, cursor.y);
  });

  it("calculates target highlight and places callout above target", () => {
    const target: GuideRect = { x: 600, y: 300, width: 120, height: 40 };
    const highlight = calculateTargetHighlight({ target, display, padding: 8 });

    assert.strictEqual(highlight.highlightRect.x, 592);
    assert.strictEqual(highlight.highlightRect.y, 292);
    assert.strictEqual(highlight.highlightRect.width, 136);
    assert.strictEqual(highlight.highlightRect.height, 56);
    // Callout sits above target
    assert.isBelow(highlight.calloutPoint.y, target.y);
  });

  it("flips callout below target when target is at the very top of display", () => {
    const target: GuideRect = { x: 100, y: 10, width: 80, height: 30 };
    const highlight = calculateTargetHighlight({ target, display, padding: 4 });

    // Since y is only 10, above would be < 0, so it must flip below
    assert.isAbove(highlight.calloutPoint.y, target.y);
  });
});

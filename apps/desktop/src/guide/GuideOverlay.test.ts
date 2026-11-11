import { assert, describe, it, vi } from "vite-plus/test";

import {
  makeGuideOverlay,
  type GuideOverlayWindowAdapter,
  type GuideViewState,
} from "./GuideOverlay.ts";

describe("GuideOverlay", () => {
  function createMockWindow(): GuideOverlayWindowAdapter & {
    updates: GuideViewState[];
    ignoredMouseEvents: boolean[];
    isShown: boolean;
    destroyed: boolean;
  } {
    const updates: GuideViewState[] = [];
    const ignoredMouseEvents: boolean[] = [];
    let isShown = false;
    let destroyed = false;

    return {
      updates,
      ignoredMouseEvents,
      get isShown() {
        return isShown;
      },
      get destroyed() {
        return destroyed;
      },
      isDestroyed: () => destroyed,
      destroy: () => {
        destroyed = true;
      },
      show: () => {
        isShown = true;
      },
      hide: () => {
        isShown = false;
      },
      setIgnoreMouseEvents: (ignore) => {
        ignoredMouseEvents.push(ignore);
      },
      sendUpdate: (state) => {
        updates.push(state);
      },
      getBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    };
  }

  it("points at target element, sets mouse pass-through, and shows window", () => {
    const mockWin = createMockWindow();
    const overlay = makeGuideOverlay({ windows: [mockWin] });

    overlay.pointAtTarget({
      target: { x: 300, y: 200, width: 100, height: 40 },
      label: "Click to create thread",
      step: "Step 1 of 3",
    });

    assert.isTrue(mockWin.isShown);
    assert.isTrue(mockWin.ignoredMouseEvents[0]); // Must pass through mouse events!
    const state = overlay.getCurrentState();
    assert.isTrue(state.visible);
    assert.strictEqual(state.text, "Click to create thread");
    assert.strictEqual(state.step, "Step 1 of 3");
    assert.isDefined(state.highlight);
    assert.isDefined(state.pointer);
    assert.isDefined(state.calloutPoint);
  });

  it("follows cursor companion with offset", () => {
    const mockWin = createMockWindow();
    const overlay = makeGuideOverlay({ windows: [mockWin] });

    overlay.followCursor({
      cursor: { x: 500, y: 350 },
      label: "I am next to your cursor",
    });

    const state = overlay.getCurrentState();
    assert.isTrue(state.visible);
    assert.strictEqual(state.text, "I am next to your cursor");
    assert.isUndefined(state.highlight);
    assert.strictEqual(state.pointer?.x, 500 + 35);
  });

  it("dismisses and hides overlay", () => {
    const mockWin = createMockWindow();
    const overlay = makeGuideOverlay({ windows: [mockWin] });

    overlay.pointAtTarget({
      target: { x: 100, y: 100, width: 50, height: 20 },
    });
    assert.isTrue(overlay.getCurrentState().visible);

    overlay.dismiss();
    assert.isFalse(overlay.getCurrentState().visible);
  });

  it("releases and destroys all windows", () => {
    const mockWin = createMockWindow();
    const overlay = makeGuideOverlay({ windows: [mockWin] });

    overlay.release();
    assert.isTrue(mockWin.destroyed);
  });

  it("auto-dismisses after duration timer expires", () => {
    vi.useFakeTimers();
    try {
      const mockWin = createMockWindow();
      const overlay = makeGuideOverlay({
        windows: [mockWin],
        options: { defaultDurationMs: 1000 },
      });

      overlay.pointAtTarget({
        target: { x: 100, y: 100, width: 50, height: 20 },
        durationMs: 500,
      });
      assert.isTrue(overlay.getCurrentState().visible);

      vi.advanceTimersByTime(501);
      assert.isFalse(overlay.getCurrentState().visible);
    } finally {
      vi.useRealTimers();
    }
  });
});

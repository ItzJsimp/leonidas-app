// @effect-diagnostics globalTimers:off -- Timers handle UI overlay auto-dismissal outside Effect fibers.
import type * as Electron from "electron";

import {
  calculateCursorCompanionPlacement,
  calculateTargetHighlight,
  type GuideDisplayBounds,
  type GuidePoint,
  type GuideRect,
} from "./GuideGeometry.ts";
import { renderGuideOverlayPage } from "./GuideOverlayPage.ts";

export type GuideViewState = {
  readonly visible: boolean;
  readonly highlight?: GuideRect | undefined;
  readonly pointer?: GuidePoint | undefined;
  readonly calloutPoint?: GuidePoint | undefined;
  readonly text?: string | undefined;
  readonly step?: string | undefined;
};

export type GuideOverlayOptions = {
  readonly defaultDurationMs?: number | undefined;
  readonly maxTimeoutMs?: number | undefined;
};

const DEFAULT_GUIDE_DURATION_MS = 6_000;
const MAX_SAFETY_TIMEOUT_MS = 60_000;

export type GuideOverlayWindowAdapter = {
  readonly isDestroyed: () => boolean;
  readonly destroy: () => void;
  readonly show: () => void;
  readonly hide: () => void;
  readonly setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
  readonly sendUpdate: (state: GuideViewState) => void;
  readonly getBounds: () => GuideDisplayBounds;
};

export type GuideOverlay = {
  readonly pointAtTarget: (input: {
    readonly target: GuideRect;
    readonly label?: string | undefined;
    readonly step?: string | undefined;
    readonly durationMs?: number | undefined;
  }) => void;
  readonly followCursor: (input: {
    readonly cursor: GuidePoint;
    readonly label?: string | undefined;
    readonly step?: string | undefined;
    readonly durationMs?: number | undefined;
  }) => void;
  readonly dismiss: () => void;
  readonly release: () => void;
  readonly getCurrentState: () => GuideViewState;
};

export function makeGuideOverlay(input: {
  readonly windows: ReadonlyArray<GuideOverlayWindowAdapter>;
  readonly options?: GuideOverlayOptions | undefined;
}): GuideOverlay {
  let currentState: GuideViewState = { visible: false };
  let dismissTimer: ReturnType<typeof setTimeout> | undefined;

  const defaultDuration = input.options?.defaultDurationMs ?? DEFAULT_GUIDE_DURATION_MS;
  const maxTimeout = input.options?.maxTimeoutMs ?? MAX_SAFETY_TIMEOUT_MS;

  const clearTimer = () => {
    if (dismissTimer !== undefined) {
      clearTimeout(dismissTimer);
      dismissTimer = undefined;
    }
  };

  const broadcastState = (state: GuideViewState) => {
    currentState = state;
    for (const win of input.windows) {
      if (!win.isDestroyed()) {
        win.setIgnoreMouseEvents(true, { forward: true });
        win.sendUpdate(state);
        if (state.visible) {
          win.show();
        }
      }
    }
  };

  const scheduleDismiss = (durationMs?: number) => {
    clearTimer();
    const duration = Math.min(durationMs ?? defaultDuration, maxTimeout);
    dismissTimer = setTimeout(() => {
      dismiss();
    }, duration);
  };

  const dismiss = () => {
    clearTimer();
    broadcastState({ visible: false });
  };

  const release = () => {
    dismiss();
    for (const win of input.windows) {
      if (!win.isDestroyed()) {
        win.destroy();
      }
    }
  };

  const pointAtTarget: GuideOverlay["pointAtTarget"] = ({ target, label, step, durationMs }) => {
    const primaryWindow = input.windows[0];
    const display = primaryWindow
      ? primaryWindow.getBounds()
      : { x: 0, y: 0, width: 1920, height: 1080 };

    const { highlightRect, pointerPoint, calloutPoint } = calculateTargetHighlight({
      target,
      display,
    });

    const state: GuideViewState = {
      visible: true,
      highlight: highlightRect,
      pointer: pointerPoint,
      calloutPoint,
      text: label,
      step,
    };

    broadcastState(state);
    scheduleDismiss(durationMs);
  };

  const followCursor: GuideOverlay["followCursor"] = ({ cursor, label, step, durationMs }) => {
    const primaryWindow = input.windows[0];
    const display = primaryWindow
      ? primaryWindow.getBounds()
      : { x: 0, y: 0, width: 1920, height: 1080 };

    const placement = calculateCursorCompanionPlacement({ cursor, display });

    const state: GuideViewState = {
      visible: true,
      pointer: placement.pointer,
      calloutPoint: placement.callout,
      text: label,
      step,
    };

    broadcastState(state);
    scheduleDismiss(durationMs);
  };

  return {
    pointAtTarget,
    followCursor,
    dismiss,
    release,
    getCurrentState: () => currentState,
  };
}

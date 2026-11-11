import type { BrowserSurfaceRect } from "./browserSurfaceStore";

export interface HostedBrowserWebviewSize {
  readonly width: number;
  readonly height: number;
}

export interface HostedBrowserWebviewWrapperStyle {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly zIndex: number;
  readonly pointerEvents: "auto" | "none";
  readonly borderRadius?: number;
  readonly visibility?: "hidden" | "visible";
}

export const HIDDEN_BROWSER_WEBVIEW_OFFSET = -100_000;

/**
 * A guest that paints. A parked guest gets no frames, so `requestAnimationFrame` never runs, menus
 * never open and screenshots time out. An agent drives its tab whether or not the panel shows it,
 * so an agent-owned tab keeps painting too.
 */
export function isBrowserWebviewRendering(input: {
  readonly active: boolean;
  readonly backgroundActivity: boolean;
  readonly pictureInPicture: boolean;
  readonly recordingActive: boolean;
  readonly agentDriven: boolean;
}): boolean {
  return (
    input.active ||
    input.backgroundActivity ||
    input.pictureInPicture ||
    input.recordingActive ||
    input.agentDriven
  );
}

export function resolveHostedBrowserWebviewWrapperStyle(input: {
  readonly active: boolean;
  readonly renderingActive: boolean;
  readonly keepPaintableWhenInactive?: boolean;
  readonly cornerRadius?: number;
  readonly zIndex?: number;
  readonly rect: BrowserSurfaceRect | null;
  readonly hiddenSize: HostedBrowserWebviewSize;
}): HostedBrowserWebviewWrapperStyle {
  const {
    active,
    cornerRadius = 0,
    hiddenSize,
    keepPaintableWhenInactive = false,
    rect,
    renderingActive,
    zIndex = 30,
  } = input;
  if (active && rect) {
    return {
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height,
      zIndex,
      pointerEvents: "auto",
      ...(cornerRadius > 0 ? { borderRadius: cornerRadius } : {}),
    };
  }

  if (renderingActive) {
    // Electron stops compositing a guest that is fully outside the window, even
    // when background throttling is disabled. Keep capture-active guests inside
    // the viewport but behind the app so recordings receive complete frames.
    return {
      left: 0,
      top: 0,
      width: hiddenSize.width,
      height: hiddenSize.height,
      zIndex: -1,
      pointerEvents: "none",
      visibility: "visible",
    };
  }

  return {
    left: HIDDEN_BROWSER_WEBVIEW_OFFSET,
    top: HIDDEN_BROWSER_WEBVIEW_OFFSET,
    width: hiddenSize.width,
    height: hiddenSize.height,
    zIndex: -1,
    pointerEvents: "none",
    visibility: keepPaintableWhenInactive ? "visible" : "hidden",
  };
}

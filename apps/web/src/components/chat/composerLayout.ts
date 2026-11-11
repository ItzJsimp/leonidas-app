/** How the composer sits against the timeline: resting controls, scroll hand-off, overlay height. */
export interface ComposerLayoutSlice {
  readonly restingControlsHost: HTMLDivElement | null;
  readonly restingControlsHaveLeadingContext: boolean;
  /**
   * The right end of the strip under the card. When set, reply style and permission render
   * there; when null they stay in the composer bar.
   */
  readonly settingsControlsHost: HTMLElement | null;
  readonly onRestingControlsVisibilityChange: (visible: boolean) => void;
  readonly getTimelineScrollableNode: () => HTMLElement | null;
  readonly isTimelineAtLogicalEnd: () => boolean;
  /** Whether the timeline has more content than fits above the composer. */
  readonly timelineOverflows: boolean;
  readonly onComposerOverlayHeightChange: (height: number) => void;
  /**
   * Whether the desktop resting layout is active. Reported from a layout
   * effect, so it is current before the chat view measures the overlay.
   */
  readonly onRestingChange: (resting: boolean) => void;
  readonly onPageScrollKeyDown: (key: "PageUp" | "PageDown") => void;
  readonly onPageScrollKeyUp: (key: string) => void;
  readonly onPageScrollRelease: () => void;
}

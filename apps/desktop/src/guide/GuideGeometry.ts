export type GuidePoint = {
  readonly x: number;
  readonly y: number;
};

export type GuideRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type GuideDisplayBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type AnchorOffset = {
  readonly x: number;
  readonly y: number;
};

/** Default offset placing companion 35px to the right and 8px below cursor. */
export const DEFAULT_CURSOR_OFFSET: AnchorOffset = { x: 35, y: 8 };

export type PointerPlacement = {
  readonly pointer: GuidePoint;
  readonly callout: GuidePoint;
  readonly flippedHorizontal: boolean;
  readonly flippedVertical: boolean;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculates anchor and callout coordinates relative to a cursor point,
 * ensuring tooltip and companion icon remain on-screen.
 */
export function calculateCursorCompanionPlacement(input: {
  readonly cursor: GuidePoint;
  readonly display: GuideDisplayBounds;
  readonly offset?: AnchorOffset;
  readonly calloutSize?: { readonly width: number; readonly height: number };
}): PointerPlacement {
  const offset = input.offset ?? DEFAULT_CURSOR_OFFSET;
  const calloutSize = input.calloutSize ?? { width: 180, height: 48 };

  let targetX = input.cursor.x + offset.x;
  let targetY = input.cursor.y + offset.y;
  let flippedH = false;
  let flippedV = false;

  // If companion + callout exceeds right display bound, flip to left of cursor
  if (targetX + calloutSize.width > input.display.x + input.display.width) {
    targetX = input.cursor.x - offset.x - calloutSize.width;
    flippedH = true;
  }

  // If callout exceeds bottom display bound, shift upward
  if (targetY + calloutSize.height > input.display.y + input.display.height) {
    targetY = input.cursor.y - offset.y - calloutSize.height;
    flippedV = true;
  }

  const clampedX = clamp(
    targetX,
    input.display.x + 8,
    input.display.x + input.display.width - calloutSize.width - 8,
  );
  const clampedY = clamp(
    targetY,
    input.display.y + 8,
    input.display.y + input.display.height - calloutSize.height - 8,
  );

  return {
    pointer: { x: clampedX, y: clampedY },
    callout: { x: clampedX, y: clampedY + 28 },
    flippedHorizontal: flippedH,
    flippedVertical: flippedV,
  };
}

/**
 * Computes bounding ring and callout placement for a specific target UI element.
 */
export function calculateTargetHighlight(input: {
  readonly target: GuideRect;
  readonly display: GuideDisplayBounds;
  readonly padding?: number;
  readonly calloutHeight?: number;
}): {
  readonly highlightRect: GuideRect;
  readonly pointerPoint: GuidePoint;
  readonly calloutPoint: GuidePoint;
} {
  const pad = input.padding ?? 6;
  const calloutHeight = input.calloutHeight ?? 36;

  const highlightRect: GuideRect = {
    x: input.target.x - pad,
    y: input.target.y - pad,
    width: input.target.width + pad * 2,
    height: input.target.height + pad * 2,
  };

  // Pointer touches the top-left or top-center of the highlight
  const pointerPoint: GuidePoint = {
    x: highlightRect.x + Math.min(24, highlightRect.width / 2),
    y: highlightRect.y,
  };

  // Callout sits above the target by default, or flips below if too close to top edge
  let calloutY = highlightRect.y - calloutHeight - 8;
  if (calloutY < input.display.y + 8) {
    calloutY = highlightRect.y + highlightRect.height + 8;
  }

  const calloutX = clamp(
    highlightRect.x,
    input.display.x + 8,
    input.display.x + input.display.width - 240,
  );

  return {
    highlightRect,
    pointerPoint,
    calloutPoint: { x: calloutX, y: calloutY },
  };
}

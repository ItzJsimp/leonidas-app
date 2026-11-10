import type { PreviewMiniPlayerFrame } from "../preview/previewMiniPlayerLayout";

/** Inset of the card from the canvas edges; the find bar shares it to line up. */
export const THREAD_DETAILS_CARD_GAP = 12;
// Keep in sync with --thread-details-panel-width, which sizes the popover and the find bar.
const THREAD_DETAILS_CARD_WIDTH = 280;
// Beside the card, chat may narrow to this share of its normal minimum (480 px at 16 px type),
// so a 1440 px window with both sidebars open keeps the card inline.
const MIN_CHAT_SHARE_BESIDE_CARD = 0.75;

export function resolveThreadDetailsCardDensity(
  height: number,
  content: { full: number; compact: number },
) {
  if (content.full === 0 || content.full <= height) return "full";
  if (content.compact === 0 || content.compact <= height) return "compact";
  return "essential";
}

/**
 * The card pins to the top right while a readable chat lane fits beside it.
 * The chat canvas centers chat in the space left of the card.
 */
export function resolveThreadDetailsCardLayout({
  container,
  lane,
  frame,
  overlapsDetailsCard = false,
  topInset = 0,
}: {
  container: { width: number; height: number };
  lane: { padding: number; minChatWidth: number };
  frame: PreviewMiniPlayerFrame | null;
  overlapsDetailsCard?: boolean;
  /** Space taken above the card, such as the open find bar. */
  topInset?: number;
}) {
  const gap = THREAD_DETAILS_CARD_GAP;
  const width = THREAD_DETAILS_CARD_WIDTH;
  const x = container.width - width - gap;
  if (x - lane.padding * 2 < lane.minChatWidth * MIN_CHAT_SHARE_BESIDE_CARD) return null;
  const y = gap + topInset;
  // Resizing consumes the height above the player. Dragging first tries to
  // clear the full card and folds it only when there is no readable placement.
  const height =
    overlapsDetailsCard && frame && frame.x + frame.width > x - gap && frame.x < x + width + gap
      ? Math.min(container.height - y - gap, frame.y - y - gap)
      : container.height - y - gap;
  if (height < 160) return null;
  return {
    x,
    right: gap,
    width,
    y,
    height,
  } as const;
}

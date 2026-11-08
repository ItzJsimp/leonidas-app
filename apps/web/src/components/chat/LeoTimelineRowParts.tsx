import { type TimestampFormat } from "@t3tools/contracts/settings";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { formatDayAwareTimestamp, formatChatTimestampTooltip } from "../../timestampFormat";
import { type ReactNode } from "react";

// Screen readers skim a transcript by heading, so every message announces its
// author as one. The thread title in ChatHeader is an <h2>; headings written
// inside a message are exposed below this level. Visually hidden and excluded
// from selection so sighted users and copied text are unaffected.
export const MESSAGE_HEADING_LEVEL = 3;

export function MessageAuthorHeading({ children }: { children: string }) {
  return <h3 className="sr-only select-none">{children}</h3>;
}

/**
 * Hover-revealed wall-clock time with a full-date tooltip — the same metadata
 * presentation as message rows, for work entries and turn folds. The parent
 * carries `group/timeline-row`; hover or focus on an existing control reveals
 * the time without adding a tab stop. Hidden timestamps stay outside the row
 * layout. Visibility changes immediately so leaving flow cannot overlap text
 * during a fade-out. Place it before any trailing disclosure control so
 * revealing the time does not move the chevron.
 */
export function TimelineRowTimestamp({
  createdAt,
  timestampFormat,
  className,
  alwaysVisible = false,
}: {
  createdAt: string;
  timestampFormat: TimestampFormat;
  className?: string;
  alwaysVisible?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "pointer-events-none absolute me-1 shrink-0 whitespace-nowrap rounded-md text-muted-foreground text-xs tabular-nums opacity-0 group-hover/timeline-row:pointer-events-auto group-hover/timeline-row:static group-hover/timeline-row:opacity-100 group-focus-within/timeline-row:pointer-events-auto group-focus-within/timeline-row:static group-focus-within/timeline-row:opacity-100",
              alwaysVisible && "pointer-events-auto static opacity-100",
              className,
            )}
          />
        }
      >
        {formatDayAwareTimestamp(createdAt, timestampFormat)}
      </TooltipTrigger>
      <TooltipPopup>{formatChatTimestampTooltip(createdAt, timestampFormat)}</TooltipPopup>
    </Tooltip>
  );
}

export function ActivityShimmerOverlay({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="live-activity-focus pointer-events-none absolute inset-y-0 select-none"
    >
      <span className="live-activity-focus-counter block">
        <span className="live-activity-focus-aligned block text-foreground">{children}</span>
      </span>
    </span>
  );
}

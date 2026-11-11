import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { PreviewCard, PreviewCardPopup, PreviewCardTrigger } from "~/components/ui/preview-card";

export function TimelineSystemDivider(props: {
  readonly label: string;
  readonly detail?: ReactNode | null | undefined;
  readonly tone?: "neutral" | "danger" | undefined;
  readonly icon?: LucideIcon | undefined;
  readonly showDetailSeparator?: boolean | undefined;
  readonly actionLabel?: string | undefined;
  readonly onAction?: (() => void) | undefined;
  readonly previewCard?: ReactNode | undefined;
}) {
  const Icon = props.icon;
  const content = (
    <>
      {Icon ? <Icon className="size-3 shrink-0" /> : null}
      <span className="font-medium">{props.label}</span>
      {props.detail ? (
        <span
          className={cn(
            "inline-flex min-w-0 items-center opacity-70",
            typeof props.detail === "string" && "max-w-80 truncate",
          )}
        >
          {props.showDetailSeparator === false ? null : "·\u00a0"}
          {props.detail}
        </span>
      ) : null}
    </>
  );

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 py-2 text-2xs text-muted-foreground",
        props.tone === "danger" && "text-destructive",
      )}
    >
      <span aria-hidden="true" className="h-px flex-1 bg-border/70" />
      {props.previewCard ? (
        <PreviewCard>
          <PreviewCardTrigger
            delay={200}
            closeDelay={150}
            render={
              <button
                type="button"
                aria-label={props.actionLabel ?? props.label}
                onClick={props.onAction}
                className={cn(
                  "flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-background px-2.5 py-1 transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
                  props.tone === "danger" && "border-destructive/40 text-destructive",
                )}
              />
            }
          >
            {content}
          </PreviewCardTrigger>
          <PreviewCardPopup
            align="center"
            side="top"
            sideOffset={8}
            className="w-[34rem] max-w-[calc(100vw-2rem)] p-3 shadow-xl"
          >
            {props.previewCard}
          </PreviewCardPopup>
        </PreviewCard>
      ) : props.onAction ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={props.actionLabel}
                onClick={props.onAction}
                className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-background px-2.5 py-1 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
              />
            }
          >
            {content}
          </TooltipTrigger>
          <TooltipPopup side="top">{props.actionLabel}</TooltipPopup>
        </Tooltip>
      ) : (
        <span className="flex min-w-0 flex-wrap items-center justify-center gap-1.5 rounded-full px-2 py-1">
          {content}
        </span>
      )}
      <span aria-hidden="true" className="h-px flex-1 bg-border/70" />
    </div>
  );
}

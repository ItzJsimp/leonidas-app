import { ChevronRightIcon, ChevronUpIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** Marks a section body the user opened in a short panel; density measuring skips it. */
export const THREAD_DETAILS_FOLD_EXEMPT = { "data-thread-details-fold-exempt": "" };

/** Sections share header and content insets in both the sidebar and popover. */
export function ThreadDetailsSection({
  headingId,
  title,
  actions,
  separated = true,
  showHeading = true,
  children,
  ...props
}: Omit<ComponentProps<"section">, "className" | "style" | "title" | "aria-labelledby"> & {
  headingId: string;
  title: string;
  actions?: ReactNode;
  separated?: boolean;
  showHeading?: boolean;
}) {
  return (
    <section
      {...props}
      aria-labelledby={showHeading ? headingId : undefined}
      aria-label={showHeading ? undefined : title}
      className={cn("px-2 pt-2 pb-2.5", separated && "border-t border-border/65")}
    >
      <div
        className={cn(
          "mb-1 flex min-h-6 min-w-0 items-center justify-between gap-2 px-2.5",
          !showHeading && "hidden",
        )}
      >
        <h3
          id={headingId}
          className="min-w-0 truncate text-2xs font-medium text-muted-foreground select-none"
        >
          {title}
        </h3>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** A folded section: one line that opens it again. */
export function ThreadDetailsFoldLine({
  label,
  ariaLabel,
  onOpen,
  children,
}: {
  readonly label: string;
  readonly ariaLabel: string;
  readonly onOpen: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div className="px-2 py-1.5">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={false}
        onClick={onOpen}
        className="flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="w-12 shrink-0 text-2xs font-medium text-muted-foreground">{label}</span>
        {children}
        <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}

/** Folds a section the user opened while the panel is short. */
export function ThreadDetailsFoldButton({
  label,
  onFold,
}: {
  readonly label: string;
  readonly onFold: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label={`Fold ${label}`}
            className="size-5"
            onClick={onFold}
          />
        }
      >
        <ChevronUpIcon aria-hidden className="size-3.5" />
      </TooltipTrigger>
      <TooltipPopup side="top">Fold {label} to one line</TooltipPopup>
    </Tooltip>
  );
}

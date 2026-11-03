import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

/** A folded section: native details, so it opens with Enter or Space. */
export function Fold(props: {
  readonly title: string;
  readonly children: ReactNode;
  readonly onToggle?: (open: boolean) => void;
}) {
  return (
    <details
      className="group/fold rounded-lg border border-border"
      onToggle={(event) => props.onToggle?.(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon
          aria-hidden
          className="size-3.5 text-muted-foreground group-open/fold:rotate-90"
        />
        {props.title}
      </summary>
      <div className="flex flex-col gap-3 border-t border-border p-3">{props.children}</div>
    </details>
  );
}

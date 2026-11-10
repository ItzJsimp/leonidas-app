import { cn } from "~/lib/utils";

/** An in-content tab: DESIGN.md "Tabs", a primary underline and medium text when selected. */
export function underlineTabClass(selected: boolean, className?: string): string {
  return cn(
    "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
    selected
      ? "border-primary font-medium text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground",
    className,
  );
}

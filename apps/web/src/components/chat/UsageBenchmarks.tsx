import { ChartScatterIcon } from "lucide-react";

import { useBenchmarkUi } from "../../benchmarkUiStore";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** The usage card's one benchmark entry: opens the benchmarks window. */
export function UsageBenchmarks({ compact = false }: { readonly compact?: boolean | undefined }) {
  const openWindow = useBenchmarkUi((state) => state.openWindow);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => openWindow()}
            aria-label="Compare model benchmarks"
            className={cn(
              "flex cursor-pointer items-center transition-colors",
              compact
                ? "gap-1 rounded px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                : "w-full gap-2 border-t border-border/60 pt-3 text-xs font-medium text-foreground hover:text-primary",
            )}
          />
        }
      >
        <ChartScatterIcon
          aria-hidden
          className={cn("shrink-0 text-muted-foreground", compact ? "size-3" : "size-3.5")}
        />
        <span>{compact ? "Benchmarks" : "Compare model benchmarks"}</span>
      </TooltipTrigger>
      <TooltipPopup side="top">
        Compare connected AI models across quality, speed, and cost benchmarks
      </TooltipPopup>
    </Tooltip>
  );
}

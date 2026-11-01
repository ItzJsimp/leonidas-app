import type { EnvironmentId, ModelSelection } from "@t3tools/contracts";
import { ChartScatterIcon } from "lucide-react";
import { useState } from "react";

import type { BenchmarkCandidate } from "../../lib/modelBenchmarks";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { BenchmarkExplorer, type StartBenchmarkArena } from "./BenchmarkExplorer";

/** The card's one benchmark entry: opens the explorer window. */
export function UsageBenchmarks({
  environmentId,
  candidates,
  onStartChat,
  onStartArena,
  compact = false,
}: {
  readonly environmentId: EnvironmentId;
  readonly candidates: ReadonlyArray<BenchmarkCandidate>;
  readonly onStartChat: ((selection: ModelSelection) => void) | null;
  readonly onStartArena: StartBenchmarkArena | null;
  readonly compact?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => setOpen(true)}
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
      {open ? (
        <BenchmarkExplorer
          open
          onOpenChange={setOpen}
          environmentId={environmentId}
          candidates={candidates}
          onStartChat={onStartChat}
          onStartArena={onStartArena}
        />
      ) : null}
    </>
  );
}

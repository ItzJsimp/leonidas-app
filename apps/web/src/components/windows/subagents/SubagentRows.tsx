import type { SubagentRun } from "@t3tools/contracts";
import { ExternalLinkIcon, SquareIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import { changedLabel } from "../../twoState/areaRows";
import { Tip } from "../../twoState/Tip";
import { TruncatedText } from "../shared/TruncatedText";
import {
  costLabel,
  elapsedLabel,
  KIND_LABEL,
  modelLine,
  STATUS_LABEL,
  STATUS_VARIANT,
} from "./subagents.logic";

const FOCUS =
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

export function StatusBadge({ run }: { readonly run: SubagentRun }) {
  return (
    <Badge variant={STATUS_VARIANT[run.status]} size="sm">
      {STATUS_LABEL[run.status]}
    </Badge>
  );
}

/**
 * One run. The main part selects the run for the detail panel. The actions sit beside it, not
 * inside it, so a click on Stop never also selects the row.
 */
export function RunRow({
  run,
  now,
  selected,
  onSelect,
  live,
  stopping,
  onOpen,
  onStop,
}: {
  readonly run: SubagentRun;
  readonly now: number;
  readonly selected: boolean;
  readonly onSelect: () => void;
  /** A live row shows Open and Stop. An ended row shows when the run ended. */
  readonly live: boolean;
  readonly stopping: boolean;
  readonly onOpen: () => void;
  readonly onStop: () => void;
}) {
  const detail = [
    run.parentRunId === null ? null : "Child run",
    run.parent.title,
    modelLine(run),
    KIND_LABEL[run.kind],
  ]
    .filter((part) => part !== null)
    .join(" · ");
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 transition-colors motion-reduce:transition-none",
        selected ? "bg-surface-raised" : "hover:bg-surface-raised/60",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "flex min-w-0 flex-1 basis-56 items-center gap-3 rounded-md text-left",
          FOCUS,
        )}
      >
        <span className="w-28 shrink-0">
          <StatusBadge run={run} />
        </span>
        <span className="min-w-0 flex-1">
          <TruncatedText text={run.summary} className="text-sm font-medium text-foreground" />
          <TruncatedText text={detail} className="text-xs text-muted-foreground" />
        </span>
        <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          <span className="block">{elapsedLabel(run, now)}</span>
          {run.costUsd === null ? null : <span className="block">{costLabel(run.costUsd)}</span>}
          {!live && run.endedAt ? (
            <span className="block">{changedLabel(Date.parse(run.endedAt), now)}</span>
          ) : null}
        </span>
      </button>
      {live ? (
        <div className="flex shrink-0 gap-1.5">
          <Tip
            text={
              run.childThreadId
                ? "Open the chat of this subagent"
                : "Open the chat that started it. This subagent has no chat of its own."
            }
          >
            <Button size="xs" variant="outline" onClick={onOpen}>
              <ExternalLinkIcon aria-hidden />
              Open
            </Button>
          </Tip>
          {run.canStop ? (
            <Tip text="Stop this subagent">
              <Button size="xs" variant="destructive-outline" disabled={stopping} onClick={onStop}>
                <SquareIcon aria-hidden />
                {stopping ? "Stopping" : "Stop"}
              </Button>
            </Tip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

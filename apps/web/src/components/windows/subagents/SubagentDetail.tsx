import type { SubagentRun } from "@t3tools/contracts";
import { ArrowLeftIcon, ExternalLinkIcon, MessageSquareIcon, SquareIcon } from "lucide-react";
import type { ReactNode } from "react";

import ChatMarkdown from "~/components/ChatMarkdown";
import { Button } from "~/components/ui/button";

import { Tip } from "../../twoState/Tip";
import { TruncatedText } from "../shared/TruncatedText";
import { formatFileDate } from "../files/files.logic";
import { StatusBadge } from "./SubagentRows";
import {
  costLabel,
  elapsedLabel,
  isLive,
  KIND_HELP,
  KIND_LABEL,
  modelLine,
  resultPlaceholder,
} from "./subagents.logic";

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm tabular-nums">{children}</dd>
    </div>
  );
}

/** What one run did: the task it got, the answer it gave, its timing and links to its chats. */
export function SubagentDetail({
  run,
  now,
  stopping,
  parentRun,
  onBack,
  onOpenParent,
  onOpenParentRun,
  onOpenChild,
  onStop,
}: {
  readonly run: SubagentRun;
  readonly now: number;
  readonly stopping: boolean;
  /** The run that started this run's parent chat, when it is in the list. */
  readonly parentRun: SubagentRun | null;
  /** Set when the panel replaces the list (a narrow window). */
  readonly onBack: (() => void) | null;
  readonly onOpenParent: () => void;
  /** Null when the parent run is not in the list. */
  readonly onOpenParentRun: (() => void) | null;
  readonly onOpenChild: () => void;
  readonly onStop: () => void;
}) {
  const live = isLive(run);
  return (
    <section
      aria-label={`Details of ${run.summary}`}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background"
    >
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex min-w-0 items-start gap-2">
          {onBack ? (
            <Tip text="Back to the list">
              <Button
                size="icon-xs"
                variant="ghost-muted"
                aria-label="Back to the list"
                onClick={onBack}
              >
                <ArrowLeftIcon aria-hidden />
              </Button>
            </Tip>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold wrap-anywhere">{run.summary}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge run={run} />
              <Tip text={KIND_HELP[run.kind]}>
                <span>{KIND_LABEL[run.kind]}</span>
              </Tip>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="xs" variant="outline" onClick={onOpenParent}>
            <MessageSquareIcon aria-hidden />
            Open parent chat
          </Button>
          {run.childThreadId ? (
            <Button size="xs" variant="outline" onClick={onOpenChild}>
              <ExternalLinkIcon aria-hidden />
              Open subagent chat
            </Button>
          ) : null}
          {run.canStop ? (
            <Button size="xs" variant="destructive-outline" disabled={stopping} onClick={onStop}>
              <SquareIcon aria-hidden />
              {stopping ? "Stopping" : "Stop"}
            </Button>
          ) : null}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border p-4">
        <Fact label="Parent chat">
          <TruncatedText text={run.parent.title} />
        </Fact>
        <Fact label="Model">
          <TruncatedText text={modelLine(run)} />
        </Fact>
        <Fact label="Cost">{costLabel(run.costUsd)}</Fact>
        {run.account === null ? null : (
          <Fact label="Account">
            <TruncatedText text={run.account} />
          </Fact>
        )}
        {run.parentRunId === null ? null : (
          <Fact label="Started by run">
            {onOpenParentRun === null || parentRun === null ? (
              <span className="text-muted-foreground">Not in this list</span>
            ) : (
              <button
                type="button"
                onClick={onOpenParentRun}
                className="max-w-full truncate text-left underline underline-offset-2 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {parentRun.summary}
              </button>
            )}
          </Fact>
        )}
        <Fact label="Started">{run.startedAt ? formatFileDate(run.startedAt) : "Not started"}</Fact>
        <Fact label={live ? "Running for" : "Ended"}>
          {live ? elapsedLabel(run, now) : run.endedAt ? formatFileDate(run.endedAt) : "Unknown"}
        </Fact>
        {live ? null : <Fact label="Took">{elapsedLabel(run, now) || "Unknown"}</Fact>}
      </dl>
      <div className="flex flex-col gap-5 p-4">
        <section aria-label="Task">
          <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Task</h3>
          <p className="text-sm whitespace-pre-wrap wrap-anywhere">{run.task || run.summary}</p>
        </section>
        <section aria-label="Result">
          <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Result</h3>
          {run.result ? (
            <ChatMarkdown text={run.result} cwd={undefined} className="text-sm" />
          ) : (
            <p className="text-sm text-muted-foreground">{resultPlaceholder(run)}</p>
          )}
        </section>
        {run.truncated ? (
          <p className="text-xs text-muted-foreground">
            This view shows the first part of a long text.
            {run.childThreadId
              ? " Open the subagent chat to read all of it."
              : " Open the parent chat to read more."}
          </p>
        ) : null}
      </div>
    </section>
  );
}

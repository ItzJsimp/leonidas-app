import { daysUntilDue } from "@t3tools/client-runtime/task-board/daily-planning";
import {
  BotIcon,
  ChevronRightIcon,
  CircleDashedIcon,
  ClockAlertIcon,
  HourglassIcon,
  PlayIcon,
  PlusIcon,
} from "lucide-react";
import { memo, useMemo, type ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { ChecklistBar, DueChip, PriorityBadge, StatusBadge } from "./TaskBadges";
import { ProjectChip } from "./TaskRowParts";
import { buildFocus, whyFirst } from "./doNext.logic";
import { priorityLabel, relativeTime, type TaskView } from "./taskBoard.logic";
import type { FocusList } from "./tasksPage.logic";
import type { TaskActions } from "./taskBoard.types";

const HEADING_CLASS = "text-sm font-semibold";

function Tile(props: {
  readonly count: number;
  readonly name: string;
  readonly hint: string;
  readonly icon: ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="flex min-w-0 items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 text-left outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/30"
    >
      <span className="w-10 shrink-0 text-2xl font-semibold tabular-nums">{props.count}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium [&_svg]:size-3.5">
          {props.icon}
          {props.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{props.hint}</span>
      </span>
      <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/**
 * The top of the Dashboard: one card to start, the next few after it, and counts that open the
 * matching list. It uses the same groups and order as the Table.
 */
export const FocusSection = memo(function FocusSection(props: {
  readonly tasks: ReadonlyArray<TaskView>;
  readonly names: ReadonlyMap<string, string>;
  readonly now: number;
  readonly actions: TaskActions;
  readonly onSelect: (task: TaskView) => void;
  readonly onCreate: () => void;
  readonly onOpenList: (list: FocusList) => void;
}) {
  const { now, actions, onSelect } = props;
  const focus = useMemo(() => buildFocus(props.tasks, now), [props.tasks, now]);
  const lead = focus.lead;
  const busy = lead !== null && actions.isBusy(lead.id);

  return (
    <section
      aria-label="Focus"
      className="grid min-w-0 grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1fr)_18rem]"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <h2 className={HEADING_CLASS}>Do next</h2>
        {lead === null ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Nothing open. Add a task to start.</p>
            <Button variant="outline" size="sm" onClick={props.onCreate}>
              <PlusIcon />
              Add a task
            </Button>
          </div>
        ) : (
          <article
            aria-label={lead.title}
            className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4"
          >
            <p className="text-xs text-muted-foreground">Why this one: {whyFirst(lead, now)}</p>
            <h3 className="text-lg font-semibold leading-snug text-balance">{lead.title}</h3>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <StatusBadge status={lead.status} />
              <ProjectChip name={props.names.get(lead.section) ?? null} />
              <PriorityBadge priority={lead.priority} />
              <DueChip due={lead.due} now={now} />
              <span>Updated {relativeTime(lead.updatedAt, now)}</span>
            </div>
            {lead.checklist?.total ? (
              <div className="w-48">
                <ChecklistBar checklist={lead.checklist} />
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CircleDashedIcon aria-hidden className="size-3.5" />
                No Done when list yet. Add gates before you start.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {lead.status === "todo" ? (
                <Button
                  disabled={busy}
                  onClick={() => {
                    actions.setStatus(lead, "in_progress");
                    onSelect(lead);
                  }}
                >
                  <PlayIcon />
                  Start
                </Button>
              ) : (
                <Button onClick={() => onSelect(lead)}>
                  {lead.status === "in_progress" ? <PlayIcon /> : null}
                  {lead.status === "in_progress" ? "Continue" : "Open"}
                </Button>
              )}
              {lead.status === "todo" ? (
                <Button variant="outline" onClick={() => onSelect(lead)}>
                  Open
                </Button>
              ) : null}
              {actions.canSendToAgent(lead) ? (
                <Button variant="ghost" disabled={busy} onClick={() => actions.sendToAgent(lead)}>
                  <BotIcon />
                  Draft AI chat
                </Button>
              ) : null}
            </div>
          </article>
        )}
        {focus.rest.length > 0 ? (
          <>
            <h2 className={`${HEADING_CLASS} mt-2`}>Then</h2>
            <ol className="divide-y divide-border border-y border-border">
              {focus.rest.map((task, index) => {
                const days = daysUntilDue(task.due, now);
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(task)}
                      className="grid w-full grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2.5 text-left text-sm outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/30"
                    >
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {index + 2}
                      </span>
                      <span className="truncate">{task.title}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {days !== null && days < 0
                          ? `${-days} d late`
                          : priorityLabel(task.priority)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <h2 className={HEADING_CLASS}>Lists</h2>
        <div className="grid grid-cols-1 gap-2 @xl:grid-cols-2 @3xl:grid-cols-1">
          <Tile
            count={focus.counts.now}
            name="Now"
            hint="In progress or past due"
            icon={<PlayIcon aria-hidden />}
            onClick={() => props.onOpenList("now")}
          />
          <Tile
            count={focus.counts.waiting}
            name="Waiting"
            hint="In review or blocked"
            icon={<HourglassIcon aria-hidden />}
            onClick={() => props.onOpenList("waiting")}
          />
          <Tile
            count={focus.counts.stale}
            name="Stale"
            hint="No change in 21 days"
            icon={<ClockAlertIcon aria-hidden />}
            onClick={() => props.onOpenList("stale")}
          />
          <Tile
            count={focus.counts.noGates}
            name="No gates"
            hint="No Done when list"
            icon={<CircleDashedIcon aria-hidden />}
            onClick={() => props.onOpenList("noGates")}
          />
        </div>
      </div>
    </section>
  );
});

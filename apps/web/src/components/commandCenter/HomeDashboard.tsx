import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { FoldedFeedEvent } from "@t3tools/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import { CircleCheckIcon } from "lucide-react";
import { useMemo } from "react";

import { groupCommandCenterThreads } from "~/commandCenter";
import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { openFeedEvent } from "~/eventFeedOpen";
import { useEventFeedStore } from "~/eventFeedStore";
import { cn } from "~/lib/utils";
import { useAllEnvironmentShellsBootstrapped, useThreadShells } from "~/state/entities";
import { buildThreadRouteParams } from "~/threadRoutes";

import { changedLabel } from "../twoState/areaRows";
import { actionLabel, splitFeed } from "../twoState/railFeed";
import { useCodeForward } from "../twoState/codeForwardContext";
import { useFeedStatus } from "../twoState/useTwoStateData";
import { PriorityChecklist } from "../windows/today/PriorityChecklist";
import { dueRows, localDay } from "../windows/today/today.logic";
import { usePriorities } from "../windows/today/usePriorities";
import { DoneBars, Ring, SegmentBar, toneClass } from "./charts";
import {
  capRows,
  doneSeries,
  needsYouLine,
  oldestAt,
  ringPercent,
  sinceLabel,
  statusSegments,
  taskLine,
  topTasks,
} from "./commandCenter.logic";
import {
  BigNumber,
  HomeBody,
  HomeCard,
  WidgetEmpty,
  WidgetError,
  WidgetSkeleton,
} from "./HomeWidget";
import { AutomationsCard, MemoryCard, ProjectsCard, UsageCard } from "./HomeStatCards";
import { HomeComposer } from "./HomeComposer";
import { useNowMs, useTaskCards } from "./useHomeReads";

const NEEDS_YOU_ROWS = 5;
const TOP_TASKS = 5;
/** The row dots use the same colors as the status legend above the list. */
const TASK_DOT: Readonly<Record<string, string>> = {
  in_progress: toneClass("foreground"),
  todo: toneClass("muted"),
  review: toneClass("info"),
  blocked: toneClass("warning"),
};
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * The Command Center cards. Needs you and Tasks are the tall lists on the left and right; Today
 * and Agents stack between them. Usage, Projects, Memory and Automations make the row under
 * them, and the Ask box closes the page.
 */
export function HomeDashboard() {
  // One composer per screen: in the split the chat pane has it.
  const { chatBeside } = useCodeForward();
  return (
    <div className="@container">
      <div className="grid grid-flow-row-dense gap-3 @xl:grid-cols-2 @4xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <NeedsYouCard className="@xl:col-span-2 @4xl:col-span-1 @4xl:row-span-2" />
        <TodayCard />
        <TasksCard className="@xl:col-span-2 @4xl:col-span-1 @4xl:row-span-2" />
        <AgentsCard />
      </div>
      <div className="mt-3 grid gap-3 @lg:grid-cols-2 @5xl:grid-cols-4">
        <UsageCard />
        <ProjectsCard />
        <MemoryCard />
        <AutomationsCard />
      </div>
      {chatBeside ? null : (
        <div className="mt-3">
          <HomeComposer />
        </div>
      )}
    </div>
  );
}

/** Unread questions, permission requests and failures, each with the one button that answers it. */
function NeedsYouCard({ className }: { readonly className?: string }) {
  const feed = useFeedStatus();
  const marks = useEventFeedStore((store) => store.marks);
  const markRead = useEventFeedStore((store) => store.markRead);
  const dismissAll = useEventFeedStore((store) => store.dismissAll);
  const restoreMarks = useEventFeedStore((store) => store.restoreMarks);
  const { environmentId } = useActiveAiosWorkspace();
  const navigate = useNavigate();
  const now = useNowMs();
  const { needsYou } = useMemo(() => splitFeed(feed.events, marks), [feed.events, marks]);
  const { shown, hidden } = capRows(needsYou, NEEDS_YOU_ROWS);
  const oldest = oldestAt(needsYou);

  const open = (event: FoldedFeedEvent) => {
    if (!environmentId) return;
    markRead([event.id]);
    openFeedEvent(event, environmentId, navigate);
  };
  const markAllDone = () => {
    const ids = needsYou.map((event) => event.id);
    const before = Object.fromEntries(ids.map((id) => [id, marks[id]]));
    dismissAll(ids);
    const toastId = toastManager.add({
      type: "success",
      title: `${ids.length} ${plural(ids.length, "item", "items")} done`,
      actionProps: {
        children: "Undo",
        onClick: () => {
          restoreMarks(before);
          toastManager.close(toastId);
        },
      },
    });
  };

  return (
    <HomeCard
      tab="inbox"
      title="Needs you"
      tip="Unread questions, permission requests and failures. The Notifications badge counts the same way."
      className={className}
    >
      {feed.error !== null && !feed.loaded ? (
        <WidgetError message="Your notifications could not be read." onRetry={feed.refresh} />
      ) : !feed.loaded ? (
        <WidgetSkeleton rows={5} />
      ) : (
        <>
          <BigNumber
            value={needsYou.length}
            unit="waiting"
            note={oldest === null ? undefined : `Oldest since ${sinceLabel(oldest, now)}`}
          />
          {needsYou.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
              <CircleCheckIcon aria-hidden className="size-6 text-muted-foreground" />
              <p className="max-w-64 text-sm text-muted-foreground">
                Questions, permission requests and failures show here.
              </p>
              <Link
                to="/inbox"
                className="rounded-sm text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
              >
                See every notification
              </Link>
            </div>
          ) : (
            <ul className="mt-3 -mx-2 divide-y divide-border/60">
              {shown.map((event) => {
                const label = actionLabel(event);
                const line = needsYouLine(event);
                return (
                  <li key={event.id} className="flex min-w-0 items-center gap-3 px-2 py-2.5">
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        event.level === "failed" ? "bg-destructive" : "bg-warning",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="sr-only">
                        {event.level === "failed" ? "Failed: " : "Needs you: "}
                      </span>
                      <span className="block truncate text-sm font-medium">{line.primary}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {line.secondary} · {changedLabel(Date.parse(event.ts), now)}
                      </span>
                    </span>
                    {label !== null ? (
                      <Button size="xs" variant="outline" onClick={() => open(event)}>
                        {label}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {needsYou.length > 0 ? (
            <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-sm">
              {hidden > 0 ? (
                <Link
                  to="/inbox"
                  className="rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {hidden} more in Notifications
                </Link>
              ) : (
                <span />
              )}
              <Button size="xs" variant="ghost-muted" onClick={markAllDone}>
                Mark all done
              </Button>
            </div>
          ) : null}
        </>
      )}
    </HomeCard>
  );
}

/** Today's priorities: a ring of done out of all, the tick boxes, and the tasks due. */
function TodayCard() {
  const { priorities, toggle } = usePriorities();
  const cards = useTaskCards().data;
  const now = useNowMs();
  const due = useMemo(
    () => (cards ? dueRows(cards.tasks, localDay(now), null).length : null),
    [cards, now],
  );
  return (
    <HomeCard tab="today" tip="Priorities from today's brief, and open tasks due today or earlier.">
      <HomeBody>
        {() => {
          const done = priorities.filter((priority) => priority.done).length;
          const percent = ringPercent(done, priorities.length);
          const dueNote = due === null ? null : `${due} ${plural(due, "task", "tasks")} due`;
          if (percent === null) {
            return (
              <WidgetEmpty>
                No priorities for today{dueNote ? ` · ${dueNote}` : ""}.{" "}
                <Link
                  to="/today"
                  className="rounded-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Plan today
                </Link>
              </WidgetEmpty>
            );
          }
          return (
            <div className="grid gap-3">
              <div className="flex items-center gap-3">
                <Ring percent={percent} label={`${done} of ${priorities.length} priorities done`}>
                  {`${percent}%`}
                </Ring>
                <BigNumber
                  value={`${done} of ${priorities.length}`}
                  unit="done"
                  note={dueNote ?? undefined}
                />
              </div>
              <PriorityChecklist
                dense
                priorities={priorities.slice(0, 3)}
                onToggle={(priority) => void toggle(priority)}
              />
            </div>
          );
        }}
      </HomeBody>
    </HomeCard>
  );
}

/** Open task cards: the total, the split by status, and the five to look at first. */
function TasksCard({ className }: { readonly className?: string }) {
  const cards = useTaskCards().data;
  const now = useNowMs();
  const week = useMemo(() => (cards ? doneSeries(cards.tasks, now).week : null), [cards, now]);
  const top = useMemo(() => (cards ? topTasks(cards.tasks, TOP_TASKS) : null), [cards]);
  return (
    <HomeCard
      tab="tasks"
      tip="Task cards that are To do, In progress, In review or Blocked. The list shows work in progress first, then the highest priority and the nearest due date."
      className={className}
    >
      <HomeBody rows={5}>
        {(home) => {
          const { total, segments, legend } = statusSegments(home.counts);
          return (
            <>
              <BigNumber
                value={total}
                unit="open"
                note={[
                  `${home.counts.inProgress.toLocaleString("en-US")} in progress`,
                  ...(week === null ? [] : [`${week} done this week`]),
                ].join(" · ")}
              />
              {total > 0 ? (
                <div className="mt-3 grid gap-2">
                  <SegmentBar segments={segments} label={`${total} open tasks by status`} />
                  <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {legend
                      .filter((row) => row.value > 0)
                      .map((row) => (
                        <li key={row.key} className="flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className={cn("size-2 rounded-full", toneClass(row.tone))}
                          />
                          <span className="tabular-nums">{row.value.toLocaleString("en-US")}</span>{" "}
                          {row.label.toLowerCase()}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
              {top === null ? (
                <div className="mt-4">
                  <WidgetSkeleton rows={4} />
                </div>
              ) : top.length === 0 ? (
                <div className="mt-4">
                  <WidgetEmpty>
                    No open tasks.{" "}
                    <Link
                      to="/tasks"
                      className="rounded-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      Add a task
                    </Link>
                  </WidgetEmpty>
                </div>
              ) : (
                <ul
                  aria-label="Tasks to look at first"
                  className="mt-3 -mx-2 divide-y divide-border/60"
                >
                  {top.map((task) => (
                    <li key={task.id}>
                      <Link
                        to="/tasks"
                        search={{ task: task.id }}
                        className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
                      >
                        <span
                          aria-hidden
                          className={cn("size-2 shrink-0 rounded-full", TASK_DOT[task.status])}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{task.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {taskLine(task)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {top !== null && total > top.length ? (
                <div className="mt-auto pt-3 text-sm">
                  <Link
                    to="/tasks"
                    className="rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {(total - top.length).toLocaleString("en-US")} more in Tasks
                  </Link>
                </div>
              ) : null}
            </>
          );
        }}
      </HomeBody>
    </HomeCard>
  );
}

/** Chats with an agent working now, and how many chats finished each day for two weeks. */
function AgentsCard({ className }: { readonly className?: string }) {
  const threads = useThreadShells();
  const ready = useAllEnvironmentShellsBootstrapped();
  const now = useNowMs();
  const running = useMemo(() => groupCommandCenterThreads(threads).running, [threads]);
  const series = useMemo(
    () =>
      doneSeries(
        threads.map((thread) => {
          const at = Date.parse(thread.latestRun?.completedAt ?? "");
          return {
            status: thread.latestRun?.status === "completed" ? "done" : "open",
            completedAt: Number.isFinite(at) ? at : null,
          };
        }),
        now,
      ),
    [threads, now],
  );
  const { shown, hidden } = capRows(running, 2);
  return (
    <HomeCard
      tab="subagents"
      title="Agents"
      tip="Chats with an agent working now, or waiting for background work it started."
      className={className}
    >
      {!ready ? (
        <WidgetSkeleton rows={3} />
      ) : (
        <div className="grid gap-4">
          <div className="grid min-w-0 content-start gap-3">
            <BigNumber
              value={running.length}
              unit="working now"
              note={`${series.total} ${plural(series.total, "chat", "chats")} finished in 14 days`}
            />
            {running.length === 0 ? (
              <WidgetEmpty>No agent is working right now.</WidgetEmpty>
            ) : (
              <ul className="grid gap-1.5">
                {shown.map(({ thread, status }) => {
                  const ref = scopeThreadRef(thread.environmentId, thread.id);
                  const live = status === "working";
                  return (
                    <li key={scopedThreadKey(ref)} className="min-w-0">
                      <Link
                        to="/$environmentId/$threadId"
                        params={buildThreadRouteParams(ref)}
                        className="flex min-w-0 items-center gap-2.5 rounded-lg bg-surface-raised px-3 py-2 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            live ? "bg-state" : "bg-muted-foreground/70",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {thread.title || "Untitled chat"}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-xs",
                            live ? "text-state-text" : "text-muted-foreground",
                          )}
                        >
                          {live ? "Working" : "Waiting"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
                {hidden > 0 ? (
                  <li className="px-3 text-xs text-muted-foreground">+{hidden} more</li>
                ) : null}
              </ul>
            )}
          </div>
          <DoneBars
            days={series.days}
            average={series.average}
            unit={["chat finished", "chats finished"]}
            height={48}
          />
        </div>
      )}
    </HomeCard>
  );
}

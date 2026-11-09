import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, FoldedFeedEvent } from "@t3tools/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import { CircleCheckIcon } from "lucide-react";
import { useMemo } from "react";

import { groupCommandCenterThreads } from "~/commandCenter";
import { useComposerDraftStore } from "~/composerDraftStore";
import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { openFeedEvent } from "~/eventFeedOpen";
import { useEventFeedStore } from "~/eventFeedStore";
import { useConnectedUsageAccounts } from "~/hooks/useConnectedUsageAccounts";
import { formatResetLabel, limitLabel, usedPercentLabel } from "~/lib/usageLimitsPopover";
import { cn } from "~/lib/utils";
import { useAllEnvironmentShellsBootstrapped, useThreadShells } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { buildThreadRouteParams } from "~/threadRoutes";

import { changedLabel } from "../twoState/areaRows";
import { actionLabel, splitFeed } from "../twoState/railFeed";
import { useCodeForward } from "../twoState/codeForwardContext";
import { useFeedStatus } from "../twoState/useTwoStateData";
import { PriorityChecklist } from "../windows/today/PriorityChecklist";
import { dueRows, localDay } from "../windows/today/today.logic";
import { usePriorities } from "../windows/today/usePriorities";
import { DoneBars, HalfGauge, Ring } from "./charts";
import {
  accountName,
  capRows,
  doneSeries,
  needsYouLine,
  oldestAt,
  ringPercent,
  sinceLabel,
  usageGlance,
} from "./commandCenter.logic";
import {
  BigNumber,
  HomeBody,
  HomeCard,
  MeterRow,
  WidgetEmpty,
  WidgetError,
  WidgetSkeleton,
} from "./HomeWidget";
import { AutomationsCard, MemoryCard, ProjectsCard, TasksCard } from "./HomeStatCards";
import { HomeComposer } from "./HomeComposer";
import { useNowMs, useTaskCards } from "./useHomeReads";

const NEEDS_YOU_ROWS = 5;
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * The Command Center cards. Needs you and Usage are the tall cards on the left and right; Today
 * and Agents stack between them. Tasks, Projects, Memory and Automations make the row under
 * them, and the Ask box closes the page.
 */
export function HomeDashboard() {
  // One composer per screen: in the split the chat pane has it.
  const { chatBeside } = useCodeForward();
  return (
    <div className="@container">
      <div className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <NeedsYouCard className="@xl:col-span-2 @4xl:col-span-1 @4xl:row-span-2" />
        <TodayCard />
        <UsageCard className="@4xl:row-span-2" />
        <AgentsCard className="@xl:col-span-2 @4xl:col-span-1" />
      </div>
      <div className="mt-3 grid gap-3 @lg:grid-cols-2 @5xl:grid-cols-4">
        <TasksCard />
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

/** The account the next chat uses on a half gauge, then the other accounts, fullest first. */
function UsageCard({ className }: { readonly className?: string }) {
  const environmentId = usePrimaryEnvironmentId();
  const instanceId = useComposerDraftStore((store) => store.stickyActiveProvider);
  const accounts = useConnectedUsageAccounts((environmentId ?? "") as EnvironmentId, instanceId);
  const now = useNowMs();
  const glance = useMemo(
    () => usageGlance(accounts.active, accounts.others),
    [accounts.active, accounts.others],
  );
  const main = glance.main;
  return (
    <HomeCard
      tab="usage"
      tip="How much of each plan limit you have used. The gauge is the account your next chat uses."
      stretch
      className={className}
    >
      {main === null ? (
        <WidgetEmpty>No AI account has reported its limits yet.</WidgetEmpty>
      ) : (
        <div className="flex flex-1 flex-col gap-5">
          <div className="flex flex-1 flex-col items-center justify-center py-2">
            <HalfGauge
              percent={usedPercentLabel(main.window.usedPercent)}
              label={`${accountName(main.account)}: ${usedPercentLabel(main.window.usedPercent)} percent of the ${limitLabel(main.window, "glance").toLowerCase()} used`}
            />
            <p className="mt-3 max-w-full truncate text-center text-sm font-medium">
              {accountName(main.account)}
            </p>
            <p className="max-w-full truncate text-center text-xs text-muted-foreground">
              {limitLabel(main.window, "glance")}
            </p>
            {main.window.resetsAt ? (
              <p className="text-center text-xs text-muted-foreground">
                {formatResetLabel(main.window.resetsAt, now, (at) =>
                  new Date(at).toLocaleString("en-US", {
                    weekday: "long",
                    hour: "numeric",
                    minute: "2-digit",
                  }),
                )}
              </p>
            ) : null}
          </div>
          {glance.rest.length > 0 ? (
            <ul
              aria-label="Other accounts"
              className="mt-auto grid gap-2 border-t border-border/60 pt-4"
            >
              {glance.rest.map(({ account, window }) => (
                <MeterRow
                  key={account.id}
                  label={accountName(account)}
                  percent={window.usedPercent}
                  value={`${usedPercentLabel(window.usedPercent)}%`}
                />
              ))}
            </ul>
          ) : null}
        </div>
      )}
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

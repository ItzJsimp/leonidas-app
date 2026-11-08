import { useMemo } from "react";

import { cn } from "~/lib/utils";

import { statusOf, summarize } from "../automations/automations.logic";
import { useAutomations } from "../automations/state";
import { changedLabel } from "../twoState/areaRows";
import { useProjectRows } from "../windows/projects/useProjectRows";
import { SegmentBar, toneClass } from "./charts";
import { areaBars, doneSeries, statusSegments } from "./commandCenter.logic";
import { BigNumber, HomeBody, HomeCard, MeterRow, WidgetError, WidgetSkeleton } from "./HomeWidget";
import { useNowMs, useTaskCards } from "./useHomeReads";

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);
const timeOf = (at: number) =>
  new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** Open task cards: the total, one bar split by status, and what got done this week. */
export function TasksCard() {
  const cards = useTaskCards().data;
  const now = useNowMs();
  const week = useMemo(() => (cards ? doneSeries(cards.tasks, now).week : null), [cards, now]);
  return (
    <HomeCard
      tab="tasks"
      tip="Task cards that are To do, In progress, In review or Blocked."
      stretch
    >
      <HomeBody>
        {(home) => {
          const { total, segments, legend } = statusSegments(home.counts);
          return (
            <div className="grid gap-3">
              <BigNumber
                value={total}
                unit="open"
                note={[
                  `${home.counts.inProgress.toLocaleString("en-US")} in progress`,
                  ...(week === null ? [] : [`${week} done this week`]),
                ].join(" · ")}
              />
              {total > 0 ? (
                <>
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
                </>
              ) : null}
            </div>
          );
        }}
      </HomeBody>
    </HomeCard>
  );
}

/** Projects in this workspace, the newest activity first. */
export function ProjectsCard() {
  const { rows } = useProjectRows();
  const now = useNowMs();
  const newest = rows?.[0];
  return (
    <HomeCard tab="projects" tip="Projects in this workspace, without the scratch folder." stretch>
      {rows === null ? (
        <WidgetSkeleton />
      ) : (
        <div className="grid gap-3">
          <BigNumber
            value={rows.length}
            unit={plural(rows.length, "project", "projects")}
            note={
              newest?.lastActivity
                ? `Last active: ${newest.name} · ${changedLabel(newest.lastActivity, now)}`
                : rows.length === 0
                  ? "Add a project to start"
                  : undefined
            }
          />
          {rows.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {rows.slice(0, 3).map((row) => (
                <li
                  key={row.key}
                  className="max-w-full truncate rounded-md border border-border bg-surface-raised px-2 py-0.5 text-xs"
                >
                  {row.name}
                </li>
              ))}
              {rows.length > 3 ? (
                <li className="rounded-md px-1 py-0.5 text-xs text-muted-foreground">
                  +{rows.length - 3}
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      )}
    </HomeCard>
  );
}

/** Items in the AIOS folder, and the three biggest areas. */
export function MemoryCard() {
  return (
    <HomeCard
      tab="memory"
      tip="Cards, notes, decisions, logs, skills and pages in your AIOS folder, added up across every area."
      stretch
    >
      <HomeBody>
        {(home) => {
          const { total, bars } = areaBars(home.areas ?? []);
          return (
            <div className="grid gap-3">
              <BigNumber
                value={total}
                unit={plural(total, "item", "items")}
                note={
                  bars.length === 0
                    ? "No AIOS folder connected yet"
                    : `Across ${bars.length} ${plural(bars.length, "area", "areas")}`
                }
              />
              {bars.length > 0 ? (
                <ul className="grid gap-1.5">
                  {bars.slice(0, 3).map((bar) => (
                    <MeterRow
                      key={bar.id}
                      label={bar.label}
                      percent={bar.widthPercent}
                      value={bar.units.toLocaleString("en-US")}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          );
        }}
      </HomeBody>
    </HomeCard>
  );
}

/** Automations that are on, the ones that failed or found something, and the next run. */
export function AutomationsCard() {
  const { rows, loading, error, refresh } = useAutomations();
  const now = useNowMs();
  const summary = useMemo(() => summarize(rows, now), [rows, now]);
  const on = rows.length - summary.stopped.length;
  return (
    <HomeCard
      tab="automations"
      tip="Scheduled tasks, watchers and always-on helpers that are not stopped."
      stretch
    >
      {error !== null && rows.length === 0 ? (
        <WidgetError message="Your automations could not be read." onRetry={refresh} />
      ) : loading ? (
        <WidgetSkeleton />
      ) : (
        <div className="grid gap-3">
          <BigNumber
            value={on}
            unit="on"
            note={
              summary.next?.nextRunAt
                ? `Next: ${summary.next.name} at ${timeOf(Date.parse(summary.next.nextRunAt))}`
                : "Nothing is scheduled next"
            }
          />
          {summary.needs.length > 0 ? (
            <ul className="grid gap-1 text-xs">
              {summary.needs.slice(0, 2).map((row) => {
                const status = statusOf(row);
                return (
                  <li key={row.id} className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        row.lastResult === "failed" ? "bg-destructive" : "bg-warning",
                      )}
                    />
                    <span className="min-w-0 truncate font-medium">{row.name}</span>
                    <span className="shrink-0 text-muted-foreground">{status.label}</span>
                  </li>
                );
              })}
              {summary.needs.length > 2 ? (
                <li className="pl-4 text-muted-foreground">+{summary.needs.length - 2} more</li>
              ) : null}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              {on === 0 ? "Nothing runs by itself yet." : "Every automation ran fine."}
            </p>
          )}
        </div>
      )}
    </HomeCard>
  );
}

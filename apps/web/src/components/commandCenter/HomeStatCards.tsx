import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";

import { useComposerDraftStore } from "~/composerDraftStore";
import { useConnectedUsageAccounts } from "~/hooks/useConnectedUsageAccounts";
import { formatResetLabel, limitLabel, usedPercentLabel } from "~/lib/usageLimitsPopover";
import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";

import { statusOf, summarize } from "../automations/automations.logic";
import { useAutomations } from "../automations/state";
import { changedLabel } from "../twoState/areaRows";
import { useProjectRows } from "../windows/projects/useProjectRows";
import { accountName, areaBars, usageGlance } from "./commandCenter.logic";
import {
  BigNumber,
  HomeBody,
  HomeCard,
  MeterRow,
  WidgetEmpty,
  WidgetError,
  WidgetSkeleton,
} from "./HomeWidget";
import { useNowMs } from "./useHomeReads";

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);
const timeOf = (at: number) =>
  new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** The account the next chat uses as a big number, then up to three more accounts. */
export function UsageCard() {
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
      tip="How much of each plan limit you have used. The big number is the account your next chat uses."
      stretch
    >
      {main === null ? (
        <WidgetEmpty>No AI account has reported its limits yet.</WidgetEmpty>
      ) : (
        <div className="grid gap-3">
          <BigNumber
            value={`${usedPercentLabel(main.window.usedPercent)}%`}
            unit={`${accountName(main.account)} · ${limitLabel(main.window, "glance").toLowerCase()}`}
            note={
              formatResetLabel(main.window.resetsAt, now, (at) =>
                new Date(at).toLocaleString("en-US", {
                  weekday: "long",
                  hour: "numeric",
                  minute: "2-digit",
                }),
              ) ?? undefined
            }
          />
          {glance.rest.length > 0 ? (
            <ul aria-label="Other accounts" className="grid gap-1.5">
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

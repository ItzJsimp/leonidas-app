import type { ChatQuotaReport, EnvironmentId } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { useEnvironmentProviders } from "../../state/environments";
import { useProjects, useThreadShells } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { buildQuotaRows, type QuotaAuditLookups, type QuotaAuditRow } from "./quotaAudit.logic";

const COLLAPSED_ROWS = 8;

function QuotaBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      role="img"
      aria-label={label}
      className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted-foreground/70"
    >
      <div className="h-full rounded-full bg-state" style={{ width: `${percent}%` }} />
    </div>
  );
}

function SharedMark() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex size-2 shrink-0 rounded-full border border-warning-foreground" />
        }
      >
        <span className="sr-only">Up to: another chat or device may share these points</span>
      </TooltipTrigger>
      <TooltipPopup side="top">Another chat or device may share these points.</TooltipPopup>
    </Tooltip>
  );
}

function Figure({
  value,
  max,
  shared,
  label,
}: {
  value: number;
  max: number;
  shared: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex w-2 justify-center">{shared ? <SharedMark /> : null}</span>
      <span className="w-11 font-medium tabular-nums text-foreground">{value}%</span>
      <QuotaBar value={value} max={max} label={`${label} ${value} percent of one limit`} />
    </div>
  );
}

function QuotaTable({ rows, now }: { rows: ReadonlyArray<QuotaAuditRow>; now: number }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, COLLAPSED_ROWS);
  const maxFive = Math.max(1, ...shown.map((row) => row.fiveHour));
  const maxWeekly = Math.max(1, ...shown.map((row) => row.weekly));
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[44rem] table-fixed text-xs">
        <caption className="sr-only">Chats ranked by the plan quota they used</caption>
        <colgroup>
          <col />
          <col className="w-40" />
          <col className="w-48" />
          <col className="w-40" />
          <col className="w-24" />
        </colgroup>
        <thead>
          <tr className="h-7 border-b border-border text-3xs font-medium text-muted-foreground">
            <th scope="col" className="ps-3.5 text-start font-medium">
              Chat
            </th>
            <th scope="col" className="text-start font-medium">
              Account
            </th>
            <th scope="col" className="text-start font-medium">
              5-hour, % of one limit
            </th>
            <th scope="col" className="text-start font-medium">
              Weekly
            </th>
            <th scope="col" className="pe-3.5 text-end font-medium">
              Last active
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {shown.map((row) => (
            <tr key={row.key} className="h-12">
              <td className="min-w-0 ps-3.5 pe-3">
                <div className="truncate text-sm font-medium text-foreground">{row.title}</div>
                {row.projectName ? (
                  <div className="truncate text-2xs text-muted-foreground">{row.projectName}</div>
                ) : null}
              </td>
              <td className="pe-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-foreground">{row.accountName}</span>
                  {row.plan ? (
                    <span className="max-w-16 shrink-0 truncate rounded bg-surface-raised px-1.5 text-3xs text-muted-foreground">
                      {row.plan}
                    </span>
                  ) : null}
                </div>
              </td>
              <td>
                <Figure value={row.fiveHour} max={maxFive} shared={row.shared} label="5-hour" />
              </td>
              <td>
                <Figure value={row.weekly} max={maxWeekly} shared={row.shared} label="Weekly" />
              </td>
              <td className="pe-3.5 text-end text-muted-foreground">
                {formatRelativeTimeLabel(row.lastAt, now)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex h-9 items-center justify-between border-t border-border px-3.5 text-xs text-muted-foreground">
        <span>
          {shown.length} of {rows.length} chats
        </span>
        {rows.length > COLLAPSED_ROWS ? (
          <Button size="xs" variant="outline" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Show fewer" : "Show all"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function QuotaFootnote({ coverageStart }: { coverageStart: string | null }) {
  const since = coverageStart
    ? new Date(coverageStart).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-2xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex size-2 rounded-full border border-warning-foreground" />A
        hollow dot means another chat or device may share the points, so the number is a ceiling.
      </span>
      <span>
        {since ? `Counted since ${since}. ` : ""}Readings are kept 30 days. Points of different
        accounts do not add up.
      </span>
    </div>
  );
}

function QuotaEnvironment({
  environmentId,
  heading,
  days,
  refreshSignal,
}: {
  environmentId: EnvironmentId;
  heading: string | null;
  days: number;
  refreshSignal: number;
}) {
  const query = useEnvironmentQuery(
    serverEnvironment.chatQuotaReport({ environmentId, input: { days } }),
  );
  const { refresh } = query;
  const seenSignal = useRef(refreshSignal);
  useEffect(() => {
    if (seenSignal.current === refreshSignal) return;
    seenSignal.current = refreshSignal;
    refresh();
  }, [refreshSignal, refresh]);

  const threads = useThreadShells();
  const projects = useProjects();
  const providers = useEnvironmentProviders().get(environmentId);
  const minute = useNowMinute();
  const now = Date.parse(`${minute}:00Z`);
  const lookups: QuotaAuditLookups = {
    threads: new Map(
      threads
        .filter((thread) => thread.environmentId === environmentId)
        .map((thread) => [thread.id, { title: thread.title, projectId: thread.projectId }]),
    ),
    projects: new Map(
      projects
        .filter((project) => project.environmentId === environmentId)
        .map((project) => [project.id, project.title]),
    ),
    accounts: new Map(
      deriveProviderInstanceEntries(providers ?? []).map((entry) => [
        entry.instanceId,
        { name: entry.displayName, plan: entry.snapshot.auth.label ?? null },
      ]),
    ),
  };
  const report: ChatQuotaReport | null = query.data;
  const rows = report ? buildQuotaRows(report, lookups) : [];

  return (
    <section className="flex flex-col gap-2">
      {heading ? <h2 className="text-sm font-medium text-foreground">{heading}</h2> : null}
      {query.error && !report ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Could not read the quota readings. Try Refresh.
        </p>
      ) : !report ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Reading quota…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-12 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No quota readings in this period</p>
          <p>
            Leonidas records how your plan limit moves while a Claude chat runs. Readings appear
            after your next Claude message and are kept 30 days.
          </p>
        </div>
      ) : (
        <>
          <QuotaTable rows={rows} now={now} />
          <QuotaFootnote coverageStart={report.coverageStart} />
        </>
      )}
    </section>
  );
}

/** Ranks chats by the plan quota they used, one table per connected computer. */
export function QuotaAudit({
  environments,
  days,
  refreshSignal,
}: {
  readonly environments: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly label: string;
  }>;
  readonly days: number;
  readonly refreshSignal: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      {environments.map((environment) => (
        <QuotaEnvironment
          key={environment.environmentId}
          environmentId={environment.environmentId}
          heading={environments.length > 1 ? environment.label : null}
          days={days}
          refreshSignal={refreshSignal}
        />
      ))}
    </div>
  );
}

import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ScribeHistoryItem } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import { MicIcon, SquareIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { useEnvironmentQuery } from "~/state/query";
import {
  scribeGoalsQuery,
  scribeHistoryQuery,
  scribeInsightsQuery,
  scribeRetry,
  scribeSettingsQuery,
  scribeStart,
  scribeStop,
} from "~/state/scribe";
import { useAtomCommand } from "~/state/use-atom-command";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import {
  commandErrorMessage,
  dictateButton,
  engineErrorView,
  homeShortcuts,
  liveLine,
  rowMeta,
  shouldRetryHistory,
} from "./home.logic";
import { CopyButton, KeyCaps } from "./ScribeParts";
import type { ScribeTabProps } from "./ScribePage";
import { mergeRecent } from "./scribeLive.logic";
import { rewriteLabel } from "./transcripts.logic";
import { Meter, useRefreshOnDictation } from "./StatsParts";
import { STATS_INPUT, formatCount, formatSeconds, percentOf } from "./stats.logic";

/** Home shows the newest few. Transcripts holds the rest. */
const RECENT_ON_HOME = 5;

export function ScribeHomeTab({ environmentId, live }: ScribeTabProps) {
  const history = useEnvironmentQuery(
    scribeHistoryQuery({ environmentId, input: { limit: RECENT_ON_HOME } }),
  );
  const loaded = history.data?.items;
  const items = useMemo(
    () => mergeRecent(live.saved, loaded ?? []).slice(0, RECENT_ON_HOME),
    [live.saved, loaded],
  );
  const previousConnected = useRef(live.connected);
  const historyFailed = history.error !== null;
  const { refresh } = history;
  useEffect(() => {
    if (shouldRetryHistory(previousConnected.current, live.connected, historyFailed)) refresh();
    previousConnected.current = live.connected;
  }, [live.connected, historyFailed, refresh]);
  return (
    <div className="flex flex-col gap-6">
      <DictateCard environmentId={environmentId} live={live} />
      {live.connected === false ? null : <TodayStrip environmentId={environmentId} live={live} />}
      {live.connected === false ? null : (
        <section aria-labelledby="scribe-recent" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 id="scribe-recent" className="text-base font-semibold">
              Recent
            </h2>
            <Button
              size="sm"
              variant="ghost"
              render={<Link to="/scribe" search={{ tab: "transcripts" }} />}
            >
              See all in Transcripts
            </Button>
          </div>
          <RecentList
            items={items}
            loading={history.data === null && history.error === null}
            failed={history.error !== null && items.length === 0}
            onRetry={history.refresh}
          />
        </section>
      )}
    </div>
  );
}

/** Four numbers for today. Words use the spoken count, the same as the Progress tab. */
function TodayStrip({ environmentId, live }: ScribeTabProps) {
  const goalsQuery = useEnvironmentQuery(scribeGoalsQuery({ environmentId, input: STATS_INPUT }));
  const insightsQuery = useEnvironmentQuery(
    scribeInsightsQuery({ environmentId, input: STATS_INPUT }),
  );
  useRefreshOnDictation(`home-goals:${environmentId}`, live, goalsQuery.refresh);
  useRefreshOnDictation(`home-insights:${environmentId}`, live, insightsQuery.refresh);
  const goals = goalsQuery.data;
  const insights = insightsQuery.data;
  // The strip is extra. When the numbers fail, Home still works without it.
  if (goalsQuery.error !== null || insightsQuery.error !== null) return null;
  if (goals === null || insights === null) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]" aria-busy="true">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-[5.5rem]" />
        ))}
      </div>
    );
  }
  const goal = goals.today.goal;
  return (
    <dl aria-label="Today" className="grid grid-cols-2 gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]">
      <TodayCell
        label="Words today"
        value={formatCount(insights.todayWords)}
        unit={`of ${formatCount(goal)} goal`}
        className="col-span-2 md:col-span-1"
      >
        <Meter percent={percentOf(insights.todayWords, goal)} />
      </TodayCell>
      <TodayCell label="Dictations" value={formatCount(goals.today.dictations)}>
        today
      </TodayCell>
      <TodayCell
        label="Typical wait"
        value={insights.latencySamples > 0 ? formatSeconds(insights.p50) : "None yet"}
      >
        from stop to text
      </TodayCell>
      <TodayCell label="Streak" value={`${goals.streak} ${goals.streak === 1 ? "day" : "days"}`}>
        best {goals.bestStreak}
      </TodayCell>
    </dl>
  );
}

function TodayCell(props: {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-lg border border-border bg-card px-4 py-3",
        props.className,
      )}
    >
      <dt className="text-xs text-muted-foreground">{props.label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-2">
        <span className="truncate text-2xl font-semibold tracking-tight tabular-nums">
          {props.value}
        </span>
        {props.unit ? (
          <span className="truncate text-sm text-muted-foreground tabular-nums">{props.unit}</span>
        ) : null}
      </dd>
      <dd className="mt-1.5 text-xs text-muted-foreground">{props.children}</dd>
    </div>
  );
}

function DictateCard({ environmentId, live }: ScribeTabProps) {
  const runStart = useAtomCommand(scribeStart, { reportFailure: false });
  const runStop = useAtomCommand(scribeStop, { reportFailure: false });
  const runRetry = useAtomCommand(scribeRetry, { reportFailure: false });
  const canRetry = useAtomValue(scribeRetry.permissionAtom(environmentId));
  const canStart = useAtomValue(scribeStart.permissionAtom(environmentId));
  const canStop = useAtomValue(scribeStop.permissionAtom(environmentId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const button = dictateButton(live.connected, live.state);
  const allowed = button.action === "stop" ? canStop : canStart;

  const press = async () => {
    if (busy || button.action === "none") return;
    setBusy(true);
    setError(null);
    const result =
      button.action === "start"
        ? await runStart({ environmentId, input: { mode: "toggle" } })
        : await runStop({ environmentId, input: { paste: false } });
    setBusy(false);
    if (result._tag !== "Success" && !isAtomCommandInterrupted(result)) {
      setError(commandErrorMessage(squashAtomCommandFailure(result)));
    }
  };

  const retry = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await runRetry({ environmentId, input: {} });
    setBusy(false);
    if (result._tag !== "Success" && !isAtomCommandInterrupted(result)) {
      setError(commandErrorMessage(squashAtomCommandFailure(result)));
    }
  };

  const failure = live.lastError ? engineErrorView(live.lastError) : null;
  const message =
    live.connected === false
      ? "Scribe engine is not running. Start it from the tray, or install it."
      : error;
  const line = liveLine(live.state, live.partial, live.lastTranscript);
  return (
    <section aria-label="Dictate" className="rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <Button
          size="xl"
          className="sm:min-w-32"
          variant={button.action === "stop" ? "destructive" : "default"}
          disabled={button.disabled || busy || !allowed}
          onClick={() => void press()}
        >
          {button.action === "stop" ? <SquareIcon aria-hidden /> : <MicIcon aria-hidden />}
          {button.label}
        </Button>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:pt-2.5">
          <p
            aria-live="polite"
            className={cn(
              "line-clamp-4 text-sm",
              line.hint ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {line.text}
          </p>
          {message ? (
            <p role="alert" className="text-sm text-destructive-foreground">
              {message}
            </p>
          ) : null}
          {live.lastError && failure ? (
            <div role="alert" className="flex flex-col items-start gap-2 text-sm">
              <div>
                <p className="font-medium">{failure.title}</p>
                <p className="text-muted-foreground">{live.lastError.message}</p>
              </div>
              {failure.retry ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !canRetry}
                  onClick={() => void retry()}
                >
                  Retry
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <Shortcuts environmentId={environmentId} />
    </section>
  );
}

/** The shortcuts as key caps, so a new user finds them without the Settings tab. */
function Shortcuts(props: { readonly environmentId: ScribeTabProps["environmentId"] }) {
  const settings = useEnvironmentQuery(
    scribeSettingsQuery({ environmentId: props.environmentId, input: {} }),
  ).data;
  // Hidden until the settings load, so the card does not jump or show wrong keys.
  if (settings === null) return null;
  return (
    <dl className="grid gap-x-6 gap-y-3 border-t border-border/60 px-5 py-4 sm:grid-cols-3">
      {homeShortcuts(settings.sections.hotkeys).map((row) => (
        <div key={row.label} className="flex min-w-0 flex-col gap-1.5">
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {row.bindings.length === 0 ? (
              <span className="text-sm text-muted-foreground">Not set</span>
            ) : (
              row.bindings.map((binding, index) => (
                <span key={binding} className="inline-flex items-center gap-2">
                  {index > 0 ? <span className="text-xs text-muted-foreground">or</span> : null}
                  <KeyCaps binding={binding} />
                </span>
              ))
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RecentList(props: {
  readonly items: readonly ScribeHistoryItem[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly onRetry: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  if (props.items.length === 0 && props.loading) {
    return (
      <div
        className="flex flex-col gap-2"
        role="status"
        aria-busy="true"
        aria-label="Loading dictations"
      >
        {[0, 1, 2].map((key) => (
          <div key={key} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    );
  }
  if (props.failed) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm" role="alert">
        <p>Could not load your dictations.</p>
        <Button size="sm" variant="outline" onClick={props.onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  if (props.items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm">
        <p>No dictations yet.</p>
        <p className="text-muted-foreground">Press Start, speak, then press Stop.</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {props.items.map((item) => {
        const rewrite = rewriteLabel(item);
        return (
          <li key={item.id} className="flex items-start gap-3 px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm">{item.cleanedText}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {rewrite !== null ? (
                  <Badge variant="secondary" size="sm">
                    {rewrite}
                  </Badge>
                ) : null}
                <p className="text-xs text-muted-foreground">{rowMeta(item, now)}</p>
              </div>
            </div>
            <CopyButton
              text={item.cleanedText}
              label={rewrite === null ? "Copy dictation" : "Copy rewrite"}
            />
          </li>
        );
      })}
    </ul>
  );
}

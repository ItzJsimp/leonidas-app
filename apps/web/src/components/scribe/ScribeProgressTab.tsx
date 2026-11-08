import type { ScribeGoals, ScribeInsights } from "@t3tools/contracts";
import { CheckIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { useEnvironmentQuery } from "~/state/query";
import { scribeGoalsQuery, scribeInsightsQuery } from "~/state/scribe";
import { Button } from "../ui/button";
import type { ScribeTabProps } from "./ScribePage";
import {
  Clip,
  EmptyNote,
  Glyph,
  Meter,
  StatsPlaceholder,
  useRefreshOnDictation,
} from "./StatsParts";
import {
  STATS_INPUT,
  appLabel,
  countRows,
  dayBars,
  formatCount,
  formatSeconds,
  hasNoStats,
  levelModel,
  nextUnlocks,
  percentOf,
  unlockedCount,
  weekHeadline,
} from "./stats.logic";

/** Goals and Insights in one tab: today first, then the week, speed, apps and what unlocks next. */
export function ScribeProgressTab({ environmentId, live }: ScribeTabProps) {
  const goalsQuery = useEnvironmentQuery(scribeGoalsQuery({ environmentId, input: STATS_INPUT }));
  const insightsQuery = useEnvironmentQuery(
    scribeInsightsQuery({ environmentId, input: STATS_INPUT }),
  );
  useRefreshOnDictation(`goals:${environmentId}`, live, goalsQuery.refresh);
  useRefreshOnDictation(`insights:${environmentId}`, live, insightsQuery.refresh);
  const goals = goalsQuery.data;
  const insights = insightsQuery.data;
  if (goals === null || insights === null) {
    return (
      <StatsPlaceholder
        failed={goalsQuery.error !== null || insightsQuery.error !== null}
        onRetry={() => {
          goalsQuery.refresh();
          insightsQuery.refresh();
        }}
      />
    );
  }
  if (hasNoStats(insights)) {
    return (
      <EmptyNote title="Nothing to show yet">
        Hold your Scribe shortcut and speak. Your words, quests and speed show here after your first
        dictation.
      </EmptyNote>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          <Today goals={goals} insights={insights} />
          <Quests goals={goals} />
          <Apps insights={insights} />
        </div>
        <div className="flex flex-col gap-4">
          <Week insights={insights} />
          <Speed insights={insights} />
          <Unlocks achievements={goals.achievements} />
        </div>
      </div>
      {goals.truncated || insights.truncated ? (
        <p className="text-xs text-muted-foreground">
          Based on your latest 20,000 dictations. Older ones are not counted.
        </p>
      ) : null}
    </div>
  );
}

function Panel(props: {
  readonly title: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly flush?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-2">
        <h2 className="text-base font-semibold">{props.title}</h2>
        {props.aside ? (
          <span className="text-xs text-muted-foreground tabular-nums">{props.aside}</span>
        ) : null}
      </div>
      <div className={props.flush ? undefined : "px-4 pb-4"}>{props.children}</div>
    </section>
  );
}

/** Words today use the spoken count, the same number as today's bar in the week chart. */
function Today({
  goals,
  insights,
}: {
  readonly goals: ScribeGoals;
  readonly insights: ScribeInsights;
}) {
  const words = insights.todayWords;
  const goal = goals.today.goal;
  const left = goal - words;
  const level = levelModel(goals);
  return (
    <Panel title="Today">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">
          {formatCount(words)}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          of {formatCount(goal)} words
        </span>
      </div>
      <div className="mt-2.5">
        <Meter size="md" percent={percentOf(words, goal)} label="Words today toward your goal" />
      </div>
      <p className="mt-2 text-xs text-pretty text-muted-foreground">
        {left > 0 ? `${formatCount(left)} words to go. ` : "Goal reached. "}
        The goal is 10 percent above your average for your last 7 days with dictation.
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3.5">
        <Fact label="Streak" value={`${goals.streak} ${goals.streak === 1 ? "day" : "days"}`}>
          best {goals.bestStreak}
        </Fact>
        <Fact label="XP today" value={`+${formatCount(goals.today.xp)}`}>
          1 per word, 1.5 in AI apps
        </Fact>
        <Fact label={`Level ${goals.level}`} value={goals.rank}>
          {formatCount(level.toNext)} XP to level {goals.level + 1}
        </Fact>
      </dl>
    </Panel>
  );
}

function Fact(props: {
  readonly label: string;
  readonly value: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{props.label}</dt>
      <dd className="truncate text-lg font-semibold tabular-nums">{props.value}</dd>
      <dd className="text-xs text-pretty text-muted-foreground">{props.children}</dd>
    </div>
  );
}

/** The engine's quest count is all time, so the "done" number comes from today's list. */
function Quests({ goals }: { readonly goals: ScribeGoals }) {
  const done = goals.quests.filter((quest) => quest.done).length;
  return (
    <Panel title="Daily quests" aside={`${done} of ${goals.quests.length} done`} flush>
      <ul>
        {goals.quests.map((quest) => (
          <li key={quest.id} className="flex items-start gap-3 border-t border-border px-4 py-3">
            <span
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                quest.done
                  ? "border-state bg-state text-state-foreground"
                  : "border-input text-transparent",
              )}
            >
              <CheckIcon aria-hidden className="size-3" strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium">{quest.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {quest.done
                    ? `Done · +${quest.xp} XP`
                    : `${formatCount(quest.have)} of ${formatCount(quest.need)} · +${quest.xp} XP`}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{quest.desc}</p>
              <div className="mt-1.5">
                <Meter percent={quest.done ? 100 : percentOf(quest.have, quest.need)} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Week({ insights }: { readonly insights: ScribeInsights }) {
  const bars = dayBars(insights.weekly.days);
  return (
    <Panel title="Words per day" aside="This week">
      <p className="-mt-1 mb-3 text-sm text-pretty text-muted-foreground">
        {weekHeadline(insights)}
      </p>
      <ul aria-label="Words per day this week" className="grid h-40 grid-cols-7 items-end gap-2">
        {bars.map((bar, index) => {
          const today = index === bars.length - 1;
          return (
            <li key={bar.day} className="flex h-full flex-col items-center justify-end gap-1">
              <span
                className={cn(
                  "order-last text-xs",
                  today ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {today ? "Today" : bar.label}
              </span>
              <span className="text-xs tabular-nums">{formatCount(bar.words)}</span>
              <span
                aria-hidden
                className={cn(
                  "w-full max-w-10 rounded-t-md rounded-b-sm",
                  today ? "bg-state" : "bg-muted-foreground/45",
                )}
                style={{ height: `${bar.percent}%` }}
              />
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Speed({ insights }: { readonly insights: ScribeInsights }) {
  if (insights.latencySamples === 0) {
    return (
      <Panel title="Where the wait goes">
        <p className="text-sm text-muted-foreground">No timings saved yet.</p>
      </Panel>
    );
  }
  const split = insights.sttP50 > 0;
  const stt = Math.round(insights.sttShare);
  return (
    <Panel title="Where the wait goes" aside={`${formatSeconds(insights.p50)} typical`}>
      {split ? (
        <>
          <div
            role="img"
            aria-label={`Hearing ${stt} percent, clean up ${100 - stt} percent`}
            className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
          >
            <span className="bg-muted-foreground/75" style={{ width: `${stt}%` }} />
            <span className="bg-muted-foreground/35" style={{ width: `${100 - stt}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-muted-foreground/75" />
              Hearing {formatSeconds(insights.sttP50)}
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-muted-foreground/35" />
              Clean up {formatSeconds(insights.polishP50)}
            </span>
          </div>
        </>
      ) : null}
      <p className="mt-2 text-xs text-pretty text-muted-foreground">
        Hearing turns your speech into text. Clean up fixes the words. The slowest 1 in 10 takes{" "}
        {formatSeconds(insights.p90)} or more.
      </p>
    </Panel>
  );
}

function Apps({ insights }: { readonly insights: ScribeInsights }) {
  const rows = countRows(insights.byApp, 5);
  if (rows.length === 0) return null;
  return (
    <Panel title="Apps" aside="dictations">
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-1.5 text-sm"
          >
            <Clip text={appLabel(row.key)} />
            <span className="text-muted-foreground tabular-nums">{formatCount(row.count)}</span>
            <span className="col-span-2">
              <Meter tone="neutral" percent={row.percent} />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The 3 locked achievements nearest to done. "Show all" lists every one in the engine's order. */
function Unlocks({ achievements }: { readonly achievements: ScribeGoals["achievements"] }) {
  const [all, setAll] = useState(false);
  const rows = all ? achievements : nextUnlocks(achievements, 3);
  return (
    <Panel
      title={all ? "Achievements" : "Next to unlock"}
      aside={`${unlockedCount(achievements)} of ${achievements.length} unlocked`}
      flush
    >
      {rows.length === 0 ? (
        <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
          You unlocked every achievement.
        </p>
      ) : (
        <ul>
          {rows.map((achievement) => {
            const locked = !achievement.unlocked;
            return (
              <li
                key={achievement.id}
                className="flex items-start gap-3 border-t border-border px-4 py-3"
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-md bg-muted",
                    locked ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  <Glyph name={achievement.glyph} locked={locked} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={cn("font-medium", locked && "text-muted-foreground")}>
                      {achievement.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {locked ? `${percentOf(achievement.have, achievement.need)}%` : "Unlocked"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{achievement.how}</p>
                  {locked && achievement.have > 0 ? (
                    <div className="mt-1.5 flex flex-col gap-1">
                      <Meter percent={percentOf(achievement.have, achievement.need)} />
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatCount(achievement.have)} of {formatCount(achievement.need)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-border px-2 py-1.5">
        <Button size="sm" variant="ghost" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? "Show the next 3" : `Show all ${achievements.length} achievements`}
        </Button>
      </div>
    </Panel>
  );
}

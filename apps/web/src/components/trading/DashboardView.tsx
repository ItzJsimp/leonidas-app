import type { TradingCrewResult, TradingState } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";

import { ProgressBar } from "~/components/commandCenter/charts";
import { cn } from "~/lib/utils";

import {
  CHART_HEIGHT,
  CHART_WIDTH,
  RANGES,
  accountPreview,
  chartModel,
  journeySteps,
  keyNumbers,
  setupRows,
  type Range,
} from "./dashboard.logic";
import { sortCards, statusLine } from "./crew.logic";
import { chartMarkers } from "./money.logic";

export function Card({
  title,
  aside,
  className,
  children,
}: {
  readonly title: string;
  readonly aside?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-border bg-card p-4", className)}>
      <h2 className="mb-3 flex items-center justify-between gap-2 text-sm font-medium">
        {title}
        {aside ? <span className="text-xs font-normal text-muted-foreground">{aside}</span> : null}
      </h2>
      {children}
    </section>
  );
}

/** The net return line. The Money tab adds `markers` for each Payout and Firm fee. */
export function NetReturnChart({
  state,
  defaultRange = "3M",
  markers = false,
}: {
  readonly state: TradingState;
  readonly defaultRange?: Range;
  readonly markers?: boolean;
}) {
  const [range, setRange] = useState<Range>(defaultRange);
  const chart = useMemo(() => chartModel(state, range), [state, range]);
  const marks = markers ? chartMarkers(chart.plot) : [];
  return (
    <Card
      title="Net return over time"
      aside={
        <span
          role="group"
          aria-label="Range"
          className="inline-flex overflow-hidden rounded-md border border-input text-xs font-medium"
        >
          {RANGES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === range}
              onClick={() => setRange(value)}
              className={cn(
                "px-2.5 py-1 text-muted-foreground",
                value === range && "bg-card text-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </span>
      }
    >
      {chart.points === null ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Add two more dated entries to draw the line.
        </p>
      ) : (
        <div className="relative">
          <div className="relative">
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              preserveAspectRatio="none"
              className="block h-28 w-full sm:h-32"
              role="img"
              aria-label="Net return line chart"
            >
              <defs>
                <linearGradient id="trading-net-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--color-state)" stopOpacity=".28" />
                  <stop offset="1" stopColor="var(--color-state)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line
                x1="0"
                x2={CHART_WIDTH}
                y1={chart.zeroY}
                y2={chart.zeroY}
                stroke="var(--color-input)"
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
              />
              <path d={chart.area ?? ""} fill="url(#trading-net-area)" />
              <polyline
                points={chart.points}
                fill="none"
                stroke="var(--color-state)"
                strokeWidth="2"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {marks.map((mark) => (
              <span
                key={mark.key}
                style={{ left: `${mark.left}%`, top: `${mark.top}%` }}
                className={cn(
                  "pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border border-input bg-card px-1 py-0.5 text-3xs font-semibold tabular-nums",
                  mark.kind === "fee" && "text-muted-foreground",
                )}
              >
                {mark.label}
              </span>
            ))}
          </div>
          {chart.payoutNote ? (
            <span className="absolute right-1 top-0 rounded border border-input bg-card px-1.5 py-0.5 text-3xs font-semibold">
              {chart.payoutNote}
            </span>
          ) : null}
          <div className="mt-1.5 flex justify-between text-3xs text-muted-foreground">
            {chart.axis.map((tick) => (
              <span key={tick.key} className={cn(tick.odd && "max-sm:hidden")}>
                {tick.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function AccountsPreview({ state }: { readonly state: TradingState }) {
  const { rows, total, hidden } = accountPreview(state);
  return (
    <Card title="Accounts" aside="Room to Drawdown">
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li
            key={row.id}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 py-2 first:pt-0"
          >
            <div className="min-w-0">
              <div className="mb-1.5 flex justify-between gap-2 text-xs font-medium">
                <span className="truncate">{row.title}</span>
                <span className="shrink-0 font-normal text-muted-foreground">{row.detail}</span>
              </div>
              {row.percent === null ? null : (
                <ProgressBar
                  percent={row.percent}
                  label={`${row.title}, ${row.percent} percent to target`}
                />
              )}
            </div>
            <span className="text-right text-sm font-semibold tabular-nums">{row.room}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <Link
          to="/trading/accounts"
          className="mt-2 inline-block text-xs font-medium text-state-text"
        >
          See all {total}
        </Link>
      ) : null}
    </Card>
  );
}

function SetupsCard({ state }: { readonly state: TradingState }) {
  const rows = setupRows(state);
  return (
    <Card title="Setups" aside="Tagged trades">
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Tag a trade with its setup to see how each one pays.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.setup} className="py-2 first:pt-0">
              <div className="mb-1.5 flex justify-between gap-2 text-xs">
                <span className="truncate">{row.setup}</span>
                <span className="shrink-0 text-muted-foreground">{row.detail}</span>
              </div>
              <ProgressBar
                percent={row.winPercent}
                label={`${row.setup}, ${row.winPercent} percent wins`}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function JourneyCard({ state }: { readonly state: TradingState }) {
  const steps = journeySteps(state);
  const nextId = steps.find((step) => !step.done)?.id;
  return (
    <Card title="Your journey" aside={`Pass rate ${keyNumbers(state)[1]!.value}`}>
      <ol className="grid grid-cols-5 gap-x-2">
        {steps.map((step) => (
          <li key={step.id} className="flex min-w-0 flex-col gap-0.5">
            <div className="mb-1.5 flex items-center">
              <span
                aria-hidden
                className={cn(
                  "size-3 shrink-0 rounded-full",
                  step.done
                    ? "bg-state"
                    : step.id === nextId
                      ? "bg-card ring-2 ring-inset ring-state"
                      : "bg-muted-foreground/40",
                )}
              />
              <span
                aria-hidden
                className={cn(
                  "mx-1.5 h-0.5 flex-1",
                  step.done ? "bg-state" : "bg-muted-foreground/30",
                )}
              />
            </div>
            <span className="text-3xs font-medium text-muted-foreground sm:text-2xs">
              {step.label}
            </span>
            <span className="truncate text-lg font-semibold leading-tight tabular-nums sm:text-xl">
              {step.value}
            </span>
            <span className="text-2xs text-muted-foreground max-sm:hidden">{step.note}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** The Crew card: each trader's clean streak, yours first, and when the board last synced. */
export function CrewPreview({ crew }: { readonly crew: TradingCrewResult | null }) {
  const shown =
    crew === null || crew.setup !== "on"
      ? []
      : sortCards(
          crew.cards.filter((card) => card.habits !== undefined),
          crew.self,
        ).slice(0, 4);
  return (
    <Card title="Crew" aside="Clean streak">
      {crew === null || crew.setup !== "on" ? (
        <p className="text-xs text-muted-foreground">
          Join a Crew to compare clean streaks.{" "}
          <Link to="/trading/crew" className="underline underline-offset-2">
            Open Crew
          </Link>
        </p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-muted-foreground">No one shares streaks yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((card) => (
            <li key={card.trader} className="flex justify-between gap-2 py-1.5 text-sm first:pt-0">
              <span className="truncate">{card.name}</span>
              <span className="tabular-nums">{card.habits?.cleanStreak ?? 0}</span>
            </li>
          ))}
        </ul>
      )}
      {crew !== null && crew.setup === "on" ? (
        <p className="mt-2 text-2xs text-muted-foreground">
          {statusLine(crew, Date.now()).text}{" "}
          <Link to="/trading/crew" className="underline underline-offset-2">
            Open Crew
          </Link>
        </p>
      ) : null}
    </Card>
  );
}

/** Dashboard B Cockpit with A's journey row (Doop pick). Numbers come from `deriveTradingState`. */
/** `notice` shows above the key numbers, for example a new TopstepX export to import. */
export function DashboardView({
  state,
  notice,
  crew,
}: {
  readonly state: TradingState;
  readonly notice?: ReactNode;
  /** The Crew from the last sync. Null or absent shows the join line. */
  readonly crew?: TradingCrewResult | null;
}) {
  const numbers = keyNumbers(state);
  return (
    <div className="flex flex-col gap-3 p-4">
      {notice}
      <section
        aria-label="Key numbers"
        className="grid grid-cols-2 rounded-xl border border-border bg-card sm:grid-cols-3 lg:grid-cols-5"
      >
        {numbers.map((number) => (
          <div
            key={number.id}
            className="flex min-w-0 flex-col gap-0.5 border-l border-border px-4 py-2.5 first:border-l-0 max-sm:nth-[n+3]:hidden"
          >
            <span className="text-2xs font-medium text-muted-foreground">{number.label}</span>
            <span className="truncate text-xl font-semibold tracking-tight tabular-nums">
              {number.value}
            </span>
            <span className="text-2xs text-muted-foreground max-sm:hidden">{number.note}</span>
          </div>
        ))}
      </section>
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <NetReturnChart state={state} />
        <Card title="Today" aside="No pack linked">
          <p className="text-xs text-muted-foreground">
            Stop and target per account show here once a rules pack is linked in Setup.
          </p>
        </Card>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr_1fr]">
        <AccountsPreview state={state} />
        <SetupsCard state={state} />
        <CrewPreview crew={crew ?? null} />
      </div>
      <JourneyCard state={state} />
    </div>
  );
}

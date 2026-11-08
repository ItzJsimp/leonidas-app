import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, RefreshCwIcon } from "lucide-react";
import { type ReactNode, useId } from "react";

import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

import { ICONS } from "../twoState/AppRail";
import { Tip } from "../twoState/Tip";
import { useAiosHome } from "../twoState/useTwoStateData";

/** The tabs a Command Center card opens, keyed by their rail item id. */
const TABS = {
  inbox: { to: "/inbox", label: "Notifications" },
  today: { to: "/today", label: "Today" },
  tasks: { to: "/tasks", label: "Tasks" },
  projects: { to: "/projects", label: "Projects" },
  memory: { to: "/memory", label: "Memory" },
  subagents: { to: "/subagents", label: "Subagents" },
  automations: { to: "/automations", label: "Automations" },
  usage: { to: "/usage", label: "Usage" },
} as const;

export type HomeTab = keyof typeof TABS;

/** One card with a bold title, a muted count and a body. Today uses it. */
export function HomeWidget({
  title,
  count,
  aside,
  children,
}: {
  readonly title: string;
  /** What the title counts, in words: "3", "last 14 days", "by area". */
  readonly count?: ReactNode;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-xs shadow-black/30 inset-shadow-2xs inset-shadow-white/4"
    >
      <div className="mb-3 flex min-w-0 items-baseline gap-2">
        <h2 id={titleId} className="shrink-0 text-sm font-semibold">
          {title}
        </h2>
        {count !== undefined ? (
          <span className="min-w-0 text-sm text-muted-foreground tabular-nums">{count}</span>
        ) : null}
        {aside !== undefined ? <span className="ml-auto shrink-0">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * One Command Center card: the tab's rail icon and name, an arrow that opens the tab, and a
 * body. A card with no buttons inside opens its tab from anywhere on the card.
 */
export function HomeCard({
  tab,
  title,
  tip,
  stretch = false,
  className,
  children,
}: {
  readonly tab: HomeTab;
  /** The card name when it differs from the tab name ("Needs you"). */
  readonly title?: string;
  /** What the card's number counts. The arrow's tooltip says it after "Open <tab>". */
  readonly tip: string;
  readonly stretch?: boolean;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}) {
  const titleId = useId();
  const { to, label } = TABS[tab];
  const Icon = ICONS[tab];
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "relative flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-xs shadow-black/30 inset-shadow-2xs inset-shadow-white/4",
        stretch &&
          "transition-colors hover:border-ring/40 hover:bg-surface-raised motion-reduce:transition-none",
        className,
      )}
    >
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <h2 id={titleId} className="min-w-0 text-sm font-semibold">
          <Link
            to={to}
            className={cn(
              "inline-flex min-w-0 items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-ring",
              stretch && "after:absolute after:inset-0 after:rounded-2xl",
            )}
          >
            {Icon ? <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : null}
            <span className="truncate">{title ?? label}</span>
          </Link>
        </h2>
        <Tip text={`Open ${label}. ${tip}`}>
          <Link
            to={to}
            tabIndex={-1}
            aria-label={`Open ${label}`}
            className="relative z-10 ml-auto grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground motion-reduce:transition-none"
          >
            <ArrowUpRightIcon aria-hidden className="size-3.5" />
          </Link>
        </Tip>
      </div>
      {children}
    </section>
  );
}

/** The number-first block: a big number, its unit and one muted line. Null shows a skeleton. */
export function BigNumber({
  value,
  unit,
  note,
}: {
  readonly value: string | number | null;
  readonly unit?: string;
  readonly note?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="flex min-w-0 items-baseline gap-1.5">
        {value === null ? (
          <Skeleton className="h-9 w-14" />
        ) : (
          <span className="font-display text-4xl leading-none font-semibold tabular-nums">
            {typeof value === "number" ? value.toLocaleString("en-US") : value}
          </span>
        )}
        {unit ? <span className="truncate text-sm text-muted-foreground">{unit}</span> : null}
      </p>
      {note ? <p className="mt-1.5 truncate text-sm text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** A card body that reads the AIOS home: error with Try again, then skeleton, then content. */
export function HomeBody({
  children,
  rows,
}: {
  readonly children: (home: NonNullable<ReturnType<typeof useAiosHome>["data"]>) => ReactNode;
  readonly rows?: number;
}) {
  const { data, error, refresh } = useAiosHome();
  if (data === null && error !== null) {
    return <WidgetError message="Your AIOS folder could not be read." onRetry={refresh} />;
  }
  if (data === null) return <WidgetSkeleton rows={rows ?? 3} />;
  return children(data);
}

/** A quiet placeholder while a read is under way. */
export function WidgetSkeleton({ rows = 3 }: { readonly rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="grid gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={cn("h-4", index % 2 === 0 ? "w-4/5" : "w-3/5")} />
      ))}
    </div>
  );
}

/** The empty state in plain words. */
export function WidgetEmpty({ children }: { readonly children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** A failed read, with the way to try again. */
export function WidgetError({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  return (
    <div role="alert" className="relative z-10 grid justify-items-start gap-2 text-sm">
      <p className="text-muted-foreground">{message}</p>
      <Button size="xs" variant="outline" onClick={onRetry}>
        <RefreshCwIcon aria-hidden /> Try again
      </Button>
    </div>
  );
}

/** A label, a thin bar and a number: one row of a small breakdown. */
export function MeterRow({
  label,
  percent,
  value,
}: {
  readonly label: string;
  readonly percent: number;
  readonly value: string;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,5.5rem)_1fr_3rem] items-center gap-2 text-xs">
      <span className="truncate text-muted-foreground">{label}</span>
      <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/25">
        <span
          className="block h-full rounded-full bg-state"
          style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
        />
      </span>
      <span className="text-right text-muted-foreground tabular-nums">{value}</span>
    </li>
  );
}

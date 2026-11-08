import type { EnvironmentId } from "@t3tools/contracts";
import { ChevronRightIcon, EyeIcon, EyeOffIcon, LayersIcon, UsersIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

import { CapEditor } from "./CapEditor";
import {
  capBadge,
  splitRail,
  type CapBadge,
  type RailEntry,
  type TaskFocus,
} from "./tasksPage.logic";

const BADGE_TONE = {
  ok: "text-muted-foreground",
  warn: "text-warning-foreground",
  full: "font-medium text-destructive",
} as const;

const ALL = "__all__";
const FOCUS_LABELS = { inbox: "Inbox", today: "Today", upcoming: "Upcoming" } as const;
const DAILY_FOCUSES = ["inbox", "today", "upcoming"] as const;

function RailRow(props: {
  readonly label: string;
  readonly count: number;
  readonly selected: boolean;
  readonly shareable?: boolean;
  readonly badge?: CapBadge | null;
  /** A badge editor sits over the badge: keep its room, hide its text. */
  readonly badgeCovered?: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <Button
      variant={props.selected ? "secondary" : "ghost"}
      size="sm"
      className="w-full justify-start"
      aria-current={props.selected ? "true" : undefined}
      onClick={props.onSelect}
    >
      <Tooltip>
        <TooltipTrigger render={<span className="min-w-0 flex-1 truncate text-left" />}>
          {props.label}
        </TooltipTrigger>
        <TooltipPopup side="right">{props.label}</TooltipPopup>
      </Tooltip>
      {props.shareable ? (
        <Tooltip>
          <TooltipTrigger render={<span className="shrink-0 text-muted-foreground" />}>
            <UsersIcon aria-hidden className="size-3" />
            <span className="sr-only">Can be shared with collaborators</span>
          </TooltipTrigger>
          <TooltipPopup>Can be shared with collaborators</TooltipPopup>
        </Tooltip>
      ) : null}
      <span
        className={`shrink-0 text-xs tabular-nums ${BADGE_TONE[props.badge?.tone ?? "ok"]} ${props.badgeCovered ? "invisible" : ""}`}
        title={props.badge?.tone === "full" ? "At the open-task cap" : undefined}
      >
        {props.badge?.label ?? props.count.toLocaleString("en-US")}
        {props.badge?.tone === "full" ? <span className="sr-only"> (project is full)</span> : null}
      </span>
    </Button>
  );
}

/** The badge as a button: a click opens the limit editor. It sits over the row's own badge. */
function CapBadgeEditor(props: {
  readonly entry: RailEntry;
  readonly cap: number;
  readonly badge: CapBadge;
  readonly environmentId: EnvironmentId | null;
  readonly onSaved: () => void;
}) {
  const { entry, onSaved } = props;
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className="absolute top-1/2 right-0.5 -translate-y-1/2">
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="xs"
              aria-label={`Open-task limit for ${entry.name}: ${props.badge.label}. Change`}
            />
          }
        >
          <span className={`text-xs tabular-nums ${BADGE_TONE[props.badge.tone]}`}>
            {props.badge.label}
          </span>
        </PopoverTrigger>
      </span>
      <PopoverPopup align="end" width="sm">
        <div className="flex flex-col gap-3">
          <PopoverTitle>{entry.name}</PopoverTitle>
          <CapEditor
            environmentId={props.environmentId}
            projectSlug={entry.slug}
            cap={props.cap}
            warn={entry.warn ?? props.cap}
            open={entry.open}
            saveOn="button"
            onSaved={() => {
              setOpen(false);
              onSaved();
            }}
          />
        </div>
      </PopoverPopup>
    </Popover>
  );
}

/** Lists the projects that have tasks. Selecting one narrows every view to it. */
export const TaskProjectRail = memo(function TaskProjectRail(props: {
  readonly entries: ReadonlyArray<RailEntry>;
  readonly allOpen: number;
  readonly selectedSlug: string | null;
  readonly onSelect: (slug: string | null) => void;
  readonly focus: TaskFocus;
  readonly counts: Record<(typeof DAILY_FOCUSES)[number], number>;
  readonly onFocus: (focus: TaskFocus) => void;
  /** Slugs folded into "More". */
  readonly hidden: ReadonlyArray<string>;
  /** Null when there is no workspace file to save the hidden list in. */
  readonly onHide: ((slug: string, hide: boolean) => void) | null;
  /** Null until the environment is known; the limit editors need it. */
  readonly environmentId: EnvironmentId | null;
  /** Reads the board again after a limit changes. */
  readonly onCapSaved: () => void;
}) {
  const { onSelect, onHide } = props;
  const split = useMemo(
    () => splitRail(props.entries, props.hidden),
    [props.entries, props.hidden],
  );
  const row = (entry: RailEntry, hide: boolean) => {
    const badge = capBadge(entry);
    // The Inbox limit is fixed, so it gets no editor.
    const cap = entry.slug === "general" ? undefined : entry.cap;
    return (
      <div key={entry.slug} className="group/rail relative">
        <RailRow
          label={entry.name}
          count={entry.open}
          badge={badge}
          badgeCovered={badge !== null && cap !== undefined}
          selected={props.focus === "all" && props.selectedSlug === entry.slug}
          shareable={entry.repository !== null && entry.projectId !== null}
          onSelect={() => onSelect(entry.slug)}
        />
        {badge !== null && cap !== undefined ? (
          <CapBadgeEditor
            entry={entry}
            cap={cap}
            badge={badge}
            environmentId={props.environmentId}
            onSaved={props.onCapSaved}
          />
        ) : null}
        {onHide ? (
          <span className="absolute top-1/2 right-9 -translate-y-1/2 opacity-0 focus-within:opacity-100 group-hover/rail:opacity-100 pointer-coarse:opacity-100">
            <Button
              variant="ghost-muted"
              size="icon-xs"
              aria-label={`${hide ? "Hide" : "Show"} ${entry.name}`}
              onClick={() => onHide(entry.slug, hide)}
            >
              {hide ? <EyeOffIcon /> : <EyeIcon />}
            </Button>
          </span>
        ) : null}
      </div>
    );
  };
  return (
    <nav aria-label="Projects" className="flex flex-col gap-0.5">
      {DAILY_FOCUSES.map((focus) => (
        <RailRow
          key={focus}
          label={FOCUS_LABELS[focus]}
          count={props.counts[focus]}
          selected={props.focus === focus}
          onSelect={() => props.onFocus(focus)}
        />
      ))}
      <RailRow
        label="All tasks"
        count={props.allOpen}
        selected={props.focus === "all" && props.selectedSlug === null}
        onSelect={() => onSelect(null)}
      />
      <h2 className="px-2 pt-4 pb-1 text-xs font-medium text-muted-foreground">Projects</h2>
      {split.shown.map((entry) => row(entry, true))}
      {split.hidden.length > 0 ? (
        <details
          className="group/more"
          open={split.hidden.some((entry) => entry.slug === props.selectedSlug)}
        >
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1.5 text-muted-foreground text-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon aria-hidden className="size-3.5 group-open/more:rotate-90" />
            More ({split.hidden.length})
          </summary>
          {split.hidden.map((entry) => row(entry, false))}
          <p className="px-2 pt-1 text-muted-foreground text-xs">
            Hidden here and on your other devices.
          </p>
        </details>
      ) : null}
    </nav>
  );
});

/** The rail's stand-in on narrow windows, where there is no room for a column. */
export const TaskProjectSelect = memo(function TaskProjectSelect(props: {
  readonly entries: ReadonlyArray<RailEntry>;
  readonly selectedSlug: string | null;
  readonly onSelect: (slug: string | null) => void;
  readonly focus: TaskFocus;
  readonly onFocus: (focus: TaskFocus) => void;
}) {
  const { onSelect } = props;
  const items = useMemo(
    () => ({
      [ALL]: "All tasks",
      ...Object.fromEntries(DAILY_FOCUSES.map((focus) => [`__${focus}__`, FOCUS_LABELS[focus]])),
      ...Object.fromEntries(props.entries.map((entry) => [entry.slug, entry.name])),
    }),
    [props.entries],
  );
  return (
    <Select
      value={props.focus === "all" ? (props.selectedSlug ?? ALL) : `__${props.focus}__`}
      items={items}
      onValueChange={(value) => {
        const focus = DAILY_FOCUSES.find((item) => value === `__${item}__`);
        if (focus) props.onFocus(focus);
        else if (typeof value === "string") onSelect(value === ALL ? null : value);
      }}
    >
      <SelectTrigger size="sm" aria-label="Task view or project" className="min-w-0">
        <LayersIcon aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {Object.entries(items).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
});

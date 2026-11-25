import {
  AlertCircleIcon,
  BellIcon,
  CheckCircle2Icon,
  CheckIcon,
  GaugeIcon,
  MessageSquareIcon,
  ShieldAlertIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import type { KeyboardEvent, MutableRefObject, RefObject } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { EventMark } from "~/eventFeedStore";
import { cn } from "~/lib/utils";

import { changedLabel } from "../../twoState/areaRows";
import { plainEventTitle } from "../../twoState/eventText";
import { actionLabel, isEventRead, type MergedFeedEvent } from "../../twoState/railFeed";
import { Tip } from "../../twoState/Tip";
import {
  eventKind,
  formatInboxTitle,
  INBOX_TYPE_FILTERS,
  nextRowIndex,
  rowsOf,
  type EventKind,
  type InboxGroup,
  type InboxSourceMeta,
  type InboxTypeFilter,
} from "./inbox.logic";

const KIND_ICON: Readonly<Record<EventKind, LucideIcon>> = {
  failed: AlertCircleIcon,
  approval: ShieldAlertIcon,
  input: MessageSquareIcon,
  limit: GaugeIcon,
  finished: CheckCircle2Icon,
  update: BellIcon,
};

const KIND_TONE: Readonly<Record<EventKind, string>> = {
  failed: "bg-destructive/15 text-destructive-foreground",
  approval: "bg-warning/15 text-warning-foreground",
  input: "bg-warning/15 text-warning-foreground",
  limit: "bg-warning/15 text-warning-foreground",
  finished: "bg-success/15 text-success-foreground",
  update: "bg-info/15 text-info-foreground",
};

const KIND_LABEL: Readonly<Record<EventKind, string>> = {
  failed: "Failed",
  approval: "Approval needed",
  input: "Input needed",
  limit: "Usage limit",
  finished: "Finished",
  update: "Update",
};

/** Compact filter bar plus urgency-grouped notification stream with fast keyboard triage. */
export function InboxList({
  groups,
  typeFilter,
  onTypeFilter,
  projectFilter,
  onProjectFilter,
  projects,
  unreadOnly,
  onUnreadOnly,
  query,
  onQuery,
  hasActiveFilters,
  onResetFilters,
  selectedId,
  onSelectRow,
  onPrimaryAction,
  onMarkRowRead,
  onDismissRow,
  resolveSource,
  marks,
  now,
  compact,
  narrow,
  rowRefs,
  searchRef,
}: {
  readonly groups: ReadonlyArray<InboxGroup>;
  readonly typeFilter: InboxTypeFilter;
  readonly onTypeFilter: (value: InboxTypeFilter) => void;
  readonly projectFilter: string;
  readonly onProjectFilter: (value: string) => void;
  readonly projects: ReadonlyArray<string>;
  readonly unreadOnly: boolean;
  readonly onUnreadOnly: (value: boolean) => void;
  readonly query: string;
  readonly onQuery: (value: string) => void;
  readonly hasActiveFilters: boolean;
  readonly onResetFilters: () => void;
  readonly selectedId: string | undefined;
  readonly onSelectRow: (event: MergedFeedEvent) => void;
  readonly onPrimaryAction: (event: MergedFeedEvent) => void;
  readonly onMarkRowRead: (event: MergedFeedEvent) => void;
  readonly onDismissRow: (event: MergedFeedEvent) => void;
  readonly resolveSource: (event: MergedFeedEvent) => InboxSourceMeta;
  readonly marks: Readonly<Record<string, EventMark>>;
  readonly now: number;
  /** True when the inspector is open or the viewport is narrow so rows wrap cleanly. */
  readonly compact: boolean;
  readonly narrow: boolean;
  readonly rowRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  readonly searchRef: RefObject<HTMLInputElement | null>;
}) {
  const rows = rowsOf(groups);
  const typeLabel = INBOX_TYPE_FILTERS.find((item) => item.id === typeFilter)?.label ?? "All types";
  const projectLabel = projectFilter === "all" ? "All projects" : projectFilter;

  const onRowKeyDown = (keyEvent: KeyboardEvent, index: number, row: MergedFeedEvent) => {
    const next = nextRowIndex(keyEvent.key, index, rows.length);
    if (next !== null) {
      keyEvent.preventDefault();
      rowRefs.current[next]?.focus();
      return;
    }
    if (keyEvent.key === "Enter") {
      keyEvent.preventDefault();
      onPrimaryAction(row);
      return;
    }
    if (keyEvent.key === "Delete" || keyEvent.key === "Backspace") {
      keyEvent.preventDefault();
      onDismissRow(row);
    }
  };

  const tabStop = Math.max(
    0,
    rows.findIndex((row) => row.id === selectedId),
  );
  const rowIndexById = new Map(rows.map((row, idx) => [row.id, idx]));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Input
          ref={searchRef}
          type="search"
          size="sm"
          aria-label="Search notifications"
          placeholder="Search notifications"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          className="w-full sm:w-56"
        />
        <Select
          value={typeFilter}
          onValueChange={(value) => {
            if (
              value === "all" ||
              value === "needs-you" ||
              value === "failed" ||
              value === "updates"
            ) {
              onTypeFilter(value);
            }
          }}
        >
          <SelectTrigger size="sm" className="w-auto min-w-28" aria-label="Filter by type">
            <SelectValue>{typeLabel}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="start" alignItemWithTrigger={false}>
            {INBOX_TYPE_FILTERS.map((item) => (
              <SelectItem key={item.id} hideIndicator value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Select
          value={projectFilter}
          onValueChange={(value) => {
            if (value) onProjectFilter(value);
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-auto min-w-32 max-w-48"
            aria-label="Filter by project"
          >
            <SelectValue>{projectLabel}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="start" alignItemWithTrigger={false}>
            <SelectItem hideIndicator value="all">
              All projects
            </SelectItem>
            {projects.map((project) => (
              <SelectItem key={project} hideIndicator value={project}>
                {project}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Button
          size="sm"
          variant={unreadOnly ? "secondary" : "outline"}
          aria-pressed={unreadOnly}
          onClick={() => onUnreadOnly(!unreadOnly)}
        >
          Unread
        </Button>
        {hasActiveFilters ? (
          <Button size="sm" variant="ghost-muted" onClick={onResetFilters}>
            Clear filters
          </Button>
        ) : null}
        {compact ? null : (
          <div
            aria-hidden
            className="ml-auto hidden items-center gap-1.5 text-2xs text-muted-foreground lg:flex"
          >
            <kbd className="rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-3xs">
              Up/Down
            </kbd>
            <kbd className="rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-3xs">
              Enter
            </kbd>
            <kbd className="rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-3xs">
              Del
            </kbd>
            <kbd className="rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-3xs">
              /
            </kbd>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <p className="text-sm text-muted-foreground">No notifications match.</p>
            {hasActiveFilters ? (
              <Button size="xs" variant="outline" onClick={onResetFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.label} className="flex flex-col gap-1.5">
                <h2
                  className={cn(
                    "flex items-center gap-1.5 px-1 text-2xs font-semibold tracking-wider uppercase",
                    group.key === "needs-you"
                      ? "text-destructive-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <span>{group.label}</span>
                  <span className="font-normal tabular-nums">{group.events.length}</span>
                </h2>
                <ul className="flex flex-col gap-1">
                  {group.events.map((event) => {
                    const at = rowIndexById.get(event.id) ?? 0;
                    const read = isEventRead(event, marks);
                    const kind = eventKind(event);
                    const Icon = KIND_ICON[kind];
                    const active = event.id === selectedId;
                    const fullTitle = plainEventTitle(event.title);
                    const shortTitle = formatInboxTitle(event.title, 60);
                    const source = resolveSource(event);
                    const sourceText = source.threadTitle
                      ? `${source.project} · ${source.threadTitle}`
                      : source.project;
                    const primaryLabel = actionLabel(event) ?? "Inspect";
                    const timeText = changedLabel(Date.parse(event.ts), now);

                    return (
                      <li key={event.id}>
                        <div
                          className={cn(
                            "group relative flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors motion-reduce:transition-none",
                            active
                              ? "border-ring bg-accent"
                              : read
                                ? "border-border/60 bg-background hover:bg-surface-raised/60"
                                : "border-border bg-card hover:bg-surface-raised/80",
                            narrow && "flex-col items-stretch gap-y-2",
                          )}
                        >
                          <button
                            type="button"
                            ref={(element) => {
                              rowRefs.current[at] = element;
                            }}
                            data-row-id={event.id}
                            tabIndex={at === tabStop ? 0 : -1}
                            aria-current={active ? "true" : undefined}
                            onClick={() => onSelectRow(event)}
                            onKeyDown={(keyEvent) => onRowKeyDown(keyEvent, at, event)}
                            className={cn(
                              "flex min-w-0 items-center gap-2.5 rounded-sm text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                              narrow ? "w-full" : "flex-1",
                            )}
                          >
                            <span
                              className={cn(
                                "grid size-7 shrink-0 place-items-center rounded-md",
                                KIND_TONE[kind],
                              )}
                            >
                              <Icon aria-hidden className="size-3.5" />
                              <span className="sr-only">{KIND_LABEL[kind]}</span>
                            </span>
                            <span
                              className={cn(
                                "flex min-w-0 flex-1 gap-x-2.5 gap-y-0.5",
                                compact ? "flex-col items-start" : "items-center",
                              )}
                            >
                              <span className="flex min-w-0 max-w-full items-center gap-1.5">
                                {shortTitle !== fullTitle ? (
                                  <Tip text={fullTitle}>
                                    <span
                                      className={cn(
                                        "truncate text-sm",
                                        read
                                          ? "font-normal text-muted-foreground"
                                          : "font-medium text-foreground",
                                      )}
                                    >
                                      {shortTitle}
                                    </span>
                                  </Tip>
                                ) : (
                                  <span
                                    className={cn(
                                      "truncate text-sm",
                                      read
                                        ? "font-normal text-muted-foreground"
                                        : "font-medium text-foreground",
                                    )}
                                  >
                                    {shortTitle}
                                  </span>
                                )}
                                {event.count > 1 ? (
                                  <Badge
                                    size="sm"
                                    variant={kind === "failed" ? "error" : "secondary"}
                                  >
                                    x{event.count}
                                  </Badge>
                                ) : null}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {sourceText}
                              </span>
                            </span>
                            {read ? null : <span className="sr-only">Unread</span>}
                          </button>

                          <div
                            className={cn(
                              "flex shrink-0 items-center gap-1.5",
                              narrow && "w-full justify-between pl-9.5",
                            )}
                          >
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {timeText}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 max-sm:opacity-100 motion-reduce:transition-none">
                                {read ? null : (
                                  <Tip text="Mark read">
                                    <Button
                                      size="icon-xs"
                                      variant="ghost"
                                      aria-label={`Mark "${shortTitle}" as read`}
                                      onClick={() => onMarkRowRead(event)}
                                    >
                                      <CheckIcon aria-hidden />
                                    </Button>
                                  </Tip>
                                )}
                                <Tip text="Dismiss">
                                  <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    aria-label={`Dismiss "${shortTitle}"`}
                                    onClick={() => onDismissRow(event)}
                                  >
                                    <XIcon aria-hidden />
                                  </Button>
                                </Tip>
                              </div>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => onPrimaryAction(event)}
                              >
                                {primaryLabel}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

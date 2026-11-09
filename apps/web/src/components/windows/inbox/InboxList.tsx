import type { FoldedFeedEvent } from "@t3tools/contracts";
import {
  AppWindowIcon,
  EyeIcon,
  MessageSquareIcon,
  PuzzleIcon,
  TerminalSquareIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";
import type { KeyboardEvent, MutableRefObject } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { EventMark } from "~/eventFeedStore";
import { cn } from "~/lib/utils";

import { FailedTag } from "../../twoState/FailedTag";
import { changedLabel } from "../../twoState/areaRows";
import { plainEventTitle } from "../../twoState/eventText";
import { isNeedsYou } from "../../twoState/railFeed";
import { Tip } from "../../twoState/Tip";
import {
  INBOX_FILTERS,
  INBOX_GROUPINGS,
  nextRowIndex,
  rowsOf,
  sourceLabel,
  type InboxFilter,
  type InboxGroup,
  type InboxGrouping,
} from "./inbox.logic";

const SOURCE_ICON: Readonly<Record<FoldedFeedEvent["actor"]["kind"], LucideIcon>> = {
  agent: MessageSquareIcon,
  script: TerminalSquareIcon,
  app: AppWindowIcon,
  watcher: EyeIcon,
  member: UserIcon,
  mod: PuzzleIcon,
};

const EMPTY_FILTER_LINE: Readonly<Record<InboxFilter, string>> = {
  all: "Nothing matches.",
  "needs-you": "Nothing needs you.",
  finished: "Nothing finished yet.",
};

const pill = (active: boolean) =>
  cn(
    "rounded-full border px-2.5 py-0.5 text-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
    active
      ? "border-border bg-surface-raised font-medium text-foreground"
      : "border-border/60 text-muted-foreground hover:text-foreground",
  );

interface Counts {
  readonly all: number;
  readonly needsYou: number;
  readonly finished: number;
}

/** Search, filter pills with counts, then the rows in groups. Arrow keys move through the rows. */
export function InboxList({
  groups,
  counts,
  unread,
  filter,
  onFilter,
  grouping,
  onGrouping,
  onMarkAllDone,
  query,
  onQuery,
  selectedId,
  onSelect,
  onOpen,
  marks,
  now,
  rowRefs,
}: {
  readonly groups: ReadonlyArray<InboxGroup>;
  readonly counts: Counts;
  /** The rail badge number. */
  readonly unread: number;
  readonly filter: InboxFilter;
  readonly onFilter: (filter: InboxFilter) => void;
  readonly grouping: InboxGrouping;
  readonly onGrouping: (grouping: InboxGrouping) => void;
  /** Clears the rows this view shows: the filter and the search apply. */
  readonly onMarkAllDone: () => void;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly selectedId: string | undefined;
  readonly onSelect: (event: FoldedFeedEvent) => void;
  readonly onOpen: (event: FoldedFeedEvent) => void;
  readonly marks: Readonly<Record<string, EventMark>>;
  readonly now: number;
  readonly rowRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
}) {
  const rows = rowsOf(groups);
  const count = (id: InboxFilter) =>
    id === "all" ? counts.all : id === "needs-you" ? counts.needsYou : counts.finished;
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const next = nextRowIndex(event.key, index, rows.length);
    if (next === null) return;
    event.preventDefault();
    rowRefs.current[next]?.focus();
    const row = rows[next];
    if (row) onSelect(row);
  };
  // One row is in the Tab order; the arrow keys reach the rest.
  const tabStop = Math.max(
    0,
    rows.findIndex((row) => row.id === selectedId),
  );
  let index = -1;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 p-3">
        <Input
          type="search"
          aria-label="Search notifications"
          placeholder="Search notifications"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
            {INBOX_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => onFilter(item.id)}
                className={pill(filter === item.id)}
              >
                {item.label} <span className="tabular-nums">{count(item.id)}</span>
              </button>
            ))}
          </div>
          <div role="group" aria-label="Group" className="flex gap-1.5">
            {INBOX_GROUPINGS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={grouping === item.id}
                onClick={() => onGrouping(item.id)}
                className={pill(grouping === item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-h-6 items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground tabular-nums" role="status">
            {unread === 0 ? "All read" : `${unread} unread`}
          </p>
          <Tip text="Clears every message in this view from the list. You can undo it.">
            <Button
              size="xs"
              variant="ghost-muted"
              disabled={rows.length === 0}
              onClick={onMarkAllDone}
            >
              Mark all done
            </Button>
          </Tip>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {query.trim() === "" ? EMPTY_FILTER_LINE[filter] : "No messages match your search."}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h2 className="flex gap-1.5 px-4 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                <span className="min-w-0 truncate">{group.label}</span>
                <span className="font-normal tabular-nums">{group.events.length}</span>
              </h2>
              <ul>
                {group.events.map((event) => {
                  index += 1;
                  const at = index;
                  const read = marks[event.id]?.read === true;
                  const needsYou = isNeedsYou(event, read);
                  const Icon = SOURCE_ICON[event.actor.kind];
                  const active = event.id === selectedId;
                  return (
                    <li key={event.id}>
                      <button
                        type="button"
                        ref={(element) => {
                          rowRefs.current[at] = element;
                        }}
                        data-row-id={event.id}
                        tabIndex={at === tabStop ? 0 : -1}
                        aria-current={active ? "true" : undefined}
                        onClick={() => onOpen(event)}
                        onKeyDown={(key) => onKeyDown(key, at)}
                        className={cn(
                          "relative flex w-full min-w-0 items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-raised/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
                          active && "bg-surface-raised",
                        )}
                      >
                        {active ? (
                          <span
                            aria-hidden
                            className="absolute inset-y-0 left-0 w-0.5 bg-foreground"
                          />
                        ) : null}
                        <span className="relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-surface-raised text-muted-foreground">
                          <Icon aria-hidden className="size-4" />
                          {needsYou ? (
                            <span
                              aria-hidden
                              className={cn(
                                "absolute -top-0.5 -left-0.5 size-2 rounded-full",
                                event.level === "failed" ? "bg-destructive" : "bg-warning",
                              )}
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          {needsYou && event.level !== "failed" ? (
                            <span className="sr-only">Needs you: </span>
                          ) : null}
                          <span
                            className={cn(
                              "line-clamp-2 text-sm wrap-anywhere",
                              read ? "text-muted-foreground" : "font-medium text-foreground",
                            )}
                          >
                            {event.level === "failed" ? <FailedTag /> : null}
                            {plainEventTitle(event.title)}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {sourceLabel(event)}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1.5 text-xs text-muted-foreground">
                          <span className="tabular-nums">
                            {changedLabel(Date.parse(event.ts), now)}
                          </span>
                          {read ? null : (
                            <>
                              <span className="sr-only">Unread</span>
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronDownIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "~/components/ui/menu";
import { Skeleton } from "~/components/ui/skeleton";
import { toastManager } from "~/components/ui/toast";
import { openFeedEvent } from "~/eventFeedOpen";
import { useEventFeedStore } from "~/eventFeedStore";
import { useNowMinute } from "~/hooks/useNowMinute";
import { observeResize } from "~/lib/observeResize";
import { useProjects, useThreadShells } from "~/state/entities";

import { changedLabel } from "../../twoState/areaRows";
import { RailWindow, WindowError } from "../../twoState/RailWindow";
import { Tip } from "../../twoState/Tip";
import { actionLabel, eventIds, isEventRead, type MergedFeedEvent } from "../../twoState/railFeed";
import { useFeedStatus } from "../../twoState/useTwoStateData";
import { InboxDetail } from "./InboxDetail";
import { InboxList } from "./InboxList";
import { NotificationRules } from "./NotificationRules";
import {
  CLEAR_OLDER_OPTIONS,
  filterInboxEvents,
  groupInbox,
  inboxEmptyText,
  linkedThreadId,
  neighborRowId,
  olderThanIds,
  projectOptions,
  rowsOf,
  unreadIds,
  type InboxSourceMeta,
  type InboxTypeFilter,
} from "./inbox.logic";
import { useInboxFeed } from "./useInboxFeed";

/** Below this pane width the inspector replaces the stream. */
const NARROW_PANE = 640;

const TABS = [
  { id: "inbox", label: "Inbox" },
  { id: "rules", label: "Rules" },
] as const;

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Quiet, scannable Notifications window: full-width urgency stream + on-demand inspector + unified rules. */
export function InboxWindow() {
  const feed = useInboxFeed();
  const marks = useEventFeedStore((store) => store.marks);
  const markRead = useEventFeedStore((store) => store.markRead);
  const dismissAll = useEventFeedStore((store) => store.dismissAll);
  const restoreMarks = useEventFeedStore((store) => store.restoreMarks);
  const allEvents = useFeedStatus().all;
  const threads = useThreadShells();
  const projects = useProjects();
  const onRules = (useSearch({ strict: false }) as { readonly tab?: unknown }).tab === "rules";
  const navigate = useNavigate();
  const minute = useNowMinute();
  const now = Date.parse(`${minute}Z`);

  const [typeFilter, setTypeFilter] = useState<InboxTypeFilter>("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [narrow, setNarrow] = useState(false);
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (!frame) return;
    return observeResize(frame, (entries) => {
      const width = entries.at(-1)?.contentRect.width;
      if (width !== undefined) setNarrow(width < NARROW_PANE);
    });
  }, [frame]);

  useEffect(() => {
    if (onRules) return;
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (isEditableElement(event.target)) return;
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, [onRules]);

  const projectById = new Map<string, string>();
  for (const project of projects) projectById.set(project.id, project.title);

  const threadById = new Map<string, { readonly title: string; readonly projectId: string }>();
  for (const thread of threads) {
    threadById.set(thread.id, { title: thread.title, projectId: thread.projectId });
  }

  const resolveSource = (event: MergedFeedEvent): InboxSourceMeta => {
    const threadId = linkedThreadId(event);
    const thread = threadId ? threadById.get(threadId) : undefined;
    if (thread) {
      return {
        project: projectById.get(thread.projectId) ?? event.actor.name,
        threadTitle: thread.title,
      };
    }
    return { project: event.actor.name, threadTitle: null };
  };

  const availableProjects = projectOptions(feed.events, resolveSource);

  const activeProject =
    projectFilter !== "all" && !availableProjects.includes(projectFilter) ? "all" : projectFilter;

  const hasActiveFilters =
    typeFilter !== "all" || activeProject !== "all" || unreadOnly || query.trim() !== "";

  const filtered = filterInboxEvents(
    feed.events,
    marks,
    { type: typeFilter, project: activeProject, unreadOnly, query },
    resolveSource,
  );
  const groups = groupInbox(filtered, marks, now);
  const rows = rowsOf(groups);
  const selected = selectedId ? rows.find((row) => row.id === selectedId) : undefined;
  const showDetail = selected !== undefined;
  const showList = !narrow || !showDetail;

  const allUnreadIds = unreadIds(feed.events, marks);
  const olderBuckets = CLEAR_OLDER_OPTIONS.map((option) => ({
    ...option,
    ...olderThanIds(feed.events, option.ms, now),
  }));

  const resetFilters = () => {
    setTypeFilter("all");
    setProjectFilter("all");
    setUnreadOnly(false);
    setQuery("");
  };

  const closeDetail = () => {
    const lastId = selected?.id;
    setSelectedId(undefined);
    requestAnimationFrame(() => {
      if (lastId) {
        rowRefs.current.find((element) => element?.dataset.rowId === lastId)?.focus();
      }
    });
  };

  const selectRow = (event: MergedFeedEvent) => {
    setSelectedId(event.id);
    if (narrow) requestAnimationFrame(() => headingRef.current?.focus());
  };

  const primaryAction = (event: MergedFeedEvent) => {
    const label = actionLabel(event);
    if (label !== null && feed.environmentId) {
      markRead(eventIds(event));
      openFeedEvent(event, feed.environmentId, navigate);
      return;
    }
    selectRow(event);
  };

  const dismissEventsWithUndo = (ids: ReadonlyArray<string>, rowCount: number) => {
    if (ids.length === 0) return;
    const before = Object.fromEntries(ids.map((id) => [id, marks[id]]));
    dismissAll(ids);
    const toastId = toastManager.add({
      type: "success",
      title: `Cleared ${rowCount} ${rowCount === 1 ? "notification" : "notifications"}`,
      actionProps: {
        children: "Undo",
        onClick: () => {
          restoreMarks(before);
          toastManager.close(toastId);
        },
      },
    });
  };

  const dismissRow = (event: MergedFeedEvent) => {
    const target = neighborRowId(rows, event.id);
    dismissEventsWithUndo(eventIds(event), 1);
    if (selectedId === event.id) {
      setSelectedId(narrow ? undefined : target);
    }
    requestAnimationFrame(() => {
      if (target) {
        rowRefs.current.find((element) => element?.dataset.rowId === target)?.focus();
      }
    });
  };

  const markRowRead = (event: MergedFeedEvent) => {
    markRead(eventIds(event));
  };

  const visibleIds = rows.flatMap((row) => eventIds(row));

  const actions = (
    <>
      {feed.updatedAt > 0 ? (
        <Tip text={`Refresh notifications. Updated ${changedLabel(feed.updatedAt, now)}.`}>
          <Button size="xs" variant="ghost-muted" onClick={feed.refresh}>
            <RefreshCwIcon aria-hidden />
            <span className="max-sm:sr-only">Updated {changedLabel(feed.updatedAt, now)}</span>
          </Button>
        </Tip>
      ) : null}
      <Menu>
        <MenuTrigger
          render={
            <Button size="xs" variant="outline" disabled={feed.events.length === 0}>
              Clear older
              <ChevronDownIcon aria-hidden className="size-3.5" />
            </Button>
          }
        />
        <MenuPopup align="end">
          {olderBuckets.map((bucket) => (
            <MenuItem
              key={bucket.id}
              disabled={bucket.rows === 0}
              onClick={() => dismissEventsWithUndo(bucket.ids, bucket.rows)}
              className="justify-between"
            >
              <span>{bucket.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{bucket.rows}</span>
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            disabled={rows.length === 0}
            onClick={() => dismissEventsWithUndo(visibleIds, rows.length)}
            className="justify-between"
          >
            <span>All visible</span>
            <span className="text-xs text-muted-foreground tabular-nums">{rows.length}</span>
          </MenuItem>
        </MenuPopup>
      </Menu>
      <Button
        size="xs"
        variant="ghost-muted"
        disabled={allUnreadIds.length === 0}
        onClick={() => markRead(allUnreadIds)}
      >
        Mark all read
      </Button>
    </>
  );

  const empty = inboxEmptyText(feed.bad);

  return (
    <RailWindow title="Notifications" actions={onRules ? undefined : actions} tabs={TABS}>
      {(tab) =>
        tab === "rules" ? (
          <NotificationRules events={allEvents} now={now} />
        ) : feed.loading ? (
          <div role="status" aria-label="Loading notifications" className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((key) => (
              <Skeleton key={key} className="h-11 w-full" shape="card" />
            ))}
          </div>
        ) : feed.failed ? (
          <WindowError message="Could not load notifications." onRetry={feed.refresh} />
        ) : feed.events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
            <p className="text-sm text-muted-foreground">{empty.title}</p>
            {empty.line ? (
              <p className="max-w-md text-xs text-muted-foreground">{empty.line}</p>
            ) : null}
          </div>
        ) : (
          <div
            ref={setFrame}
            onKeyDown={(event) => {
              if (event.key === "Escape" && showDetail) {
                event.preventDefault();
                closeDetail();
              }
            }}
            className="-m-4 flex h-[calc(100%+2rem)] min-h-0 border-t border-border"
          >
            <div className={showList ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>
              <InboxList
                groups={groups}
                typeFilter={typeFilter}
                onTypeFilter={setTypeFilter}
                projectFilter={activeProject}
                onProjectFilter={setProjectFilter}
                projects={availableProjects}
                unreadOnly={unreadOnly}
                onUnreadOnly={setUnreadOnly}
                query={query}
                onQuery={setQuery}
                hasActiveFilters={hasActiveFilters}
                onResetFilters={resetFilters}
                selectedId={selected?.id}
                onSelectRow={selectRow}
                onPrimaryAction={primaryAction}
                onMarkRowRead={markRowRead}
                onDismissRow={dismissRow}
                resolveSource={resolveSource}
                marks={marks}
                now={now}
                compact={narrow || showDetail}
                narrow={narrow}
                rowRefs={rowRefs}
                searchRef={searchRef}
              />
            </div>
            {showDetail ? (
              <div
                className={
                  narrow
                    ? "flex min-h-0 w-full flex-col"
                    : "flex min-h-0 w-[380px] shrink-0 flex-col border-l border-border"
                }
              >
                <InboxDetail
                  key={selected.id}
                  event={selected}
                  source={resolveSource(selected)}
                  read={isEventRead(selected, marks)}
                  now={now}
                  environmentId={feed.environmentId}
                  narrow={narrow}
                  onClose={closeDetail}
                  onOpen={() => primaryAction(selected)}
                  onMarkRead={() => markRowRead(selected)}
                  onDismiss={() => dismissRow(selected)}
                  headingRef={headingRef}
                />
              </div>
            ) : null}
          </div>
        )
      }
    </RailWindow>
  );
}

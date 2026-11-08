import type { EnvironmentId } from "@t3tools/contracts";
import { ArrowLeftIcon, PinIcon, VideoIcon } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RightPanelResizeHandle } from "~/components/preview/RightPanelResizeHandle";
import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "~/hooks/useResizableWidth";
import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
import { Toggle } from "../ui/toggle";
import { Skeleton } from "../ui/skeleton";
import { WindowHeader } from "../twoState/WindowHeader";
import {
  filterMeetings,
  groupMeetings,
  formatDay,
  formatLength,
  isBusy,
  parseMeetingList,
  parseMeetingTemplates,
  stateLabel,
  type MeetingSummary,
  type MeetingFilter,
  type MeetingTemplate,
} from "./meetings.logic";
import { MeetingsLive } from "./MeetingsLive";
import { MeetingReader } from "./MeetingReader";
import { useMeetingsCall } from "./useMeetingsCall";

const POLL_MS = 4000;
const FILTERS = [
  { id: "discord", label: "Discord", hint: "Show meetings recorded from Discord." },
  { id: "kept", label: "Kept audio", hint: "Show recordings you chose to keep." },
  { id: "missing", label: "No transcript", hint: "Show meetings without a transcript." },
] as const;

export function MeetingsPage() {
  const environmentId = usePrimaryEnvironmentId();
  return (
    <div className="isolate flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden overscroll-y-none">
      {environmentId ? (
        <MeetingsBody environmentId={environmentId} />
      ) : (
        <>
          <WindowHeader title="Meetings" />
          <div className="min-h-0 flex-1 bg-background p-4 sm:p-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <VideoIcon />
                </EmptyMedia>
                <EmptyTitle>No server connected</EmptyTitle>
                <EmptyDescription>
                  Meetings run on the Leonidas server. Connect to a server to see them.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </>
      )}
    </div>
  );
}

function MeetingsBody({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const call = useMeetingsCall(environmentId);
  const [items, setItems] = useState<readonly MeetingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<readonly MeetingFilter[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const wasReaderOpen = useRef(false);
  useEffect(() => {
    if (window.innerWidth >= 1024) return;
    if (readerOpen) backRef.current?.focus();
    else if (wasReaderOpen.current)
      navRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus();
    wasReaderOpen.current = readerOpen;
  }, [readerOpen]);
  const [templates, setTemplates] = useState<readonly MeetingTemplate[] | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const templateRequest = useRef(0);
  const loadTemplates = useCallback(async () => {
    const ticket = ++templateRequest.current;
    const result = await call("GET", "templates");
    if (ticket !== templateRequest.current) return;
    setTemplates(result.ok ? parseMeetingTemplates(result.value) : []);
    setTemplateError(result.ok ? null : result.message);
  }, [call]);
  const retryTemplates = () => {
    setTemplates(null);
    setTemplateError(null);
    void loadTemplates();
  };
  useEffect(() => {
    void loadTemplates();
    return () => {
      templateRequest.current += 1;
    };
  }, [loadTemplates]);
  // Titles are cut at the default width, so the list can be dragged wider (saved between visits).
  const list = useResizableWidth({
    storageKey: "leonidas.meetings.listWidth",
    defaultWidth: 320,
    minWidth: 240,
    maxWidth: 720,
    edge: "right",
  });

  const load = useCallback(async () => {
    const result = await call("GET", "");
    if (result.ok) {
      setItems(parseMeetingList(result.value));
      setError(null);
    } else if (result.message !== null) {
      setError(result.message);
    }
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  // The engine works on a meeting in the background, so the list follows it until it settles.
  const busy = items?.some(isBusy) === true;
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [busy, load]);

  const shown = useMemo(() => filterMeetings(items ?? [], query, filters), [items, query, filters]);
  const counts = useMemo(
    () => FILTERS.map(({ id }) => filterMeetings(items ?? [], "", [id]).length),
    [items],
  );
  const clearFilters = () => {
    setFilters([]);
    setQuery("");
  };
  const groups = useMemo(() => groupMeetings(shown), [shown]);
  const current = shown.find((item) => item.id === selected) ?? shown[0] ?? null;

  return (
    <>
      <WindowHeader title="Meetings" {...(items === null ? {} : { count: items.length })} />
      <MeetingsLive environmentId={environmentId} call={call} onChanged={load} />
      <div className="flex min-h-0 min-w-0 flex-1 bg-background">
        <nav
          ref={navRef}
          aria-label="Meetings"
          style={{ [RESIZABLE_WIDTH_PROPERTY]: `${list.width}px` } as CSSProperties}
          className={cn(
            "relative min-h-0 min-w-0 flex-1 flex-col gap-2 bg-sidebar p-3 lg:w-[min(var(--resizable-width),calc(100%-20rem))] lg:flex-none lg:shrink-0 lg:border-r",
            readerOpen ? "hidden lg:flex" : "flex",
          )}
        >
          <Input
            aria-label="Search meetings"
            placeholder="Search title, app or person"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div role="group" aria-label="Filter meetings" className="flex flex-wrap gap-1.5">
            <Toggle
              size="compact"
              variant="filter"
              pressed={filters.length === 0}
              onPressedChange={() => setFilters([])}
              title="Clear filters and show all meetings."
            >
              All <span className="tabular-nums">{items?.length ?? 0}</span>
            </Toggle>
            {FILTERS.map(({ id, label, hint }, index) => (
              <Toggle
                key={id}
                size="compact"
                variant="filter"
                pressed={filters.includes(id)}
                title={hint}
                onPressedChange={(pressed) =>
                  setFilters((current) =>
                    pressed ? [...current, id] : current.filter((filter) => filter !== id),
                  )
                }
              >
                {label} <span className="tabular-nums">{counts[index]}</span>
              </Toggle>
            ))}
            {filters.length > 0 ? (
              <Button
                size="compact"
                variant="ghost-muted"
                onClick={() => setFilters([])}
                title="Clear the selected filters."
              >
                Clear
              </Button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
            {items === null && error === null ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : error !== null && items === null ? (
              <div role="alert" className="flex flex-col items-start gap-2 p-2 text-sm">
                <p>{error}</p>
                <Button size="sm" variant="outline" onClick={() => void load()}>
                  Try again
                </Button>
              </div>
            ) : shown.length === 0 ? (
              <div
                role="status"
                className="flex flex-col items-start gap-3 p-2 text-sm text-muted-foreground"
              >
                <p>
                  {items?.length === 0
                    ? "No meetings yet."
                    : "No meetings match these filters or search."}
                </p>
                {(items?.length ?? 0) > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearFilters}
                    title="Clear filters and search to show every meeting."
                  >
                    Clear filters
                  </Button>
                ) : null}
              </div>
            ) : (
              groups.map((group) => (
                <section key={group.label} aria-label={group.label}>
                  <h3 className="flex justify-between px-2.5 pt-3 pb-1 text-2xs font-medium text-muted-foreground">
                    <span>{group.label}</span>
                    <span>{group.items.length}</span>
                  </h3>
                  <ul className="flex flex-col gap-0.5">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <MeetingRow
                          item={item}
                          active={item.id === current?.id}
                          onSelect={() => {
                            setSelected(item.id);
                            setReaderOpen(true);
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
          <RightPanelResizeHandle
            handlers={list.handlers}
            className="-right-1 left-auto hidden lg:block"
          />
        </nav>
        <section
          aria-label="Meeting"
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]",
            readerOpen ? "block" : "hidden lg:block",
          )}
        >
          <div className="px-5 pt-4 lg:hidden">
            <Button
              ref={backRef}
              size="sm"
              variant="ghost"
              title="Back to the Meetings list."
              onClick={() => setReaderOpen(false)}
            >
              <ArrowLeftIcon aria-hidden />
              Meetings
            </Button>
          </div>
          {current === null ? (
            <div className="p-4 sm:p-6">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <VideoIcon />
                  </EmptyMedia>
                  <EmptyTitle>Pick a meeting</EmptyTitle>
                  <EmptyDescription>
                    Your recorded meetings and the old Python Scribe meetings show here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <MeetingReader
              key={current.id}
              summary={current}
              call={call}
              templates={templates}
              templateError={templateError}
              onRetryTemplates={retryTemplates}
              onChanged={load}
              onDeleted={() => {
                setSelected(null);
                void load();
              }}
            />
          )}
        </section>
      </div>
    </>
  );
}

function MeetingRow(props: {
  readonly item: MeetingSummary;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  const { item } = props;
  const status = stateLabel(item);
  return (
    <button
      type="button"
      aria-current={props.active ? "true" : undefined}
      onClick={props.onSelect}
      className={cn(
        "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
        props.active && "bg-accent",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
        {item.pinned ? <PinIcon aria-label="Audio kept" className="size-3.5 shrink-0" /> : null}
      </span>
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {[
            item.app ?? "",
            item.people.length > 1 ? `${item.people.length} people` : (item.people[0] ?? ""),
            formatLength(item.durationMs),
          ]
            .filter((part) => part !== "")
            .join(" · ")}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {status !== null ? (
            <Badge variant={item.state === "failed" ? "destructive" : "outline"} size="sm">
              {status}
            </Badge>
          ) : null}
          {formatDay(item.started)}
        </span>
      </span>
    </button>
  );
}

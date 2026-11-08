import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ScribeHistoryItem } from "@t3tools/contracts";
import { ChevronDownIcon, ChevronRightIcon, MicIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { scribeDeleteHistory, scribeListHistoryPage } from "~/state/scribe";
import { useAtomCommand } from "~/state/use-atom-command";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { toastManager } from "../ui/toast";
import { commandErrorReason } from "./home.logic";
import { CopyButton, IconButton } from "./ScribeParts";
import type { ScribeTabProps } from "./ScribePage";
import {
  ANY_APP,
  DAYS_PER_PAGE,
  appOptions,
  dayLabel,
  daySummary,
  groupByDay,
  isLongTranscript,
  mergeTranscripts,
  moreDaysLabel,
  foldRewrites,
  rewriteLabel,
  takeFilter,
  timeLabel,
  visibleDayItems,
  type DayGroup,
  type TakeKind,
} from "./transcripts.logic";

const FIRST_PAGE = 200;
const NEXT_PAGE = 500;
/** Search reads older pages until it has this many rows, so one search cannot pull the whole file. */
const SEARCH_ROW_LIMIT = 5000;
const UNDO_MS = 6000;

type Phase = "loading" | "ready" | "error";

export function ScribeTranscriptsTab({ environmentId, live }: ScribeTabProps) {
  const listPage = useAtomCommand(scribeListHistoryPage, { reportFailure: false });
  const runDelete = useAtomCommand(scribeDeleteHistory, { reportFailure: false });
  const [loaded, setLoaded] = useState<readonly ScribeHistoryItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [shownDays, setShownDays] = useState(DAYS_PER_PAGE);
  const [openDays, setOpenDays] = useState<ReadonlySet<string>>(new Set());
  const [collapsedDays, setCollapsedDays] = useState<ReadonlySet<string>>(new Set());
  const [showRaw, setShowRaw] = useState(false);
  const [kind, setKind] = useState<TakeKind>("all");
  const [app, setApp] = useState<string>(ANY_APP);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set());
  const [now, setNow] = useState(() => new Date());

  const [moreFailed, setMoreFailed] = useState(false);
  // Paging state the loader loop reads between awaits, where state would be stale.
  const cursor = useRef<string | null>(null);
  const rowCount = useRef(0);
  const fetching = useRef(false);
  const queryRef = useRef("");

  const loadFirst = useCallback(async () => {
    const result = await listPage({ environmentId, input: { limit: FIRST_PAGE } });
    if (isAtomCommandInterrupted(result)) return;
    if (result._tag !== "Success") {
      setPhase("error");
      return;
    }
    cursor.current = result.value.next;
    rowCount.current = result.value.items.length;
    setLoaded(result.value.items);
    setNext(result.value.next);
    setMoreFailed(false);
    setPhase("ready");
  }, [environmentId, listPage]);

  const retry = () => {
    setPhase("loading");
    void loadFirst();
  };

  /** Reads older pages. While a search is typed it keeps reading until the cap or the last page. */
  const loadOlder = useCallback(async () => {
    if (fetching.current || cursor.current === null) return;
    fetching.current = true;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      do {
        const before = cursor.current;
        if (before === null) break;
        const result = await listPage({ environmentId, input: { limit: NEXT_PAGE, before } });
        if (isAtomCommandInterrupted(result) || result._tag !== "Success") {
          setMoreFailed(true);
          break;
        }
        const page = result.value;
        cursor.current = page.next;
        rowCount.current += page.items.length;
        setLoaded((current) => [...current, ...page.items]);
        setNext(page.next);
      } while (
        queryRef.current.trim() !== "" &&
        cursor.current !== null &&
        rowCount.current < SEARCH_ROW_LIMIT
      );
    } finally {
      fetching.current = false;
      setLoadingMore(false);
    }
  }, [environmentId, listPage]);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  // A failed read tries again once when the engine comes back.
  const previousConnected = useRef(live.connected);
  useEffect(() => {
    if (phase === "error" && live.connected === true && previousConnected.current !== true) {
      void loadFirst();
    }
    previousConnected.current = live.connected;
  }, [live.connected, phase, loadFirst]);

  const items = useMemo(
    () => mergeTranscripts(live.saved, loaded, deleted),
    [live.saved, loaded, deleted],
  );

  const searching = query.trim() !== "";

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // A rewrite of a fresh dictation carries that dictation inside its card, so it shows once.
  const folded = useMemo(() => foldRewrites(items), [items]);
  const apps = useMemo(() => appOptions(items), [items]);
  const groups = useMemo(() => {
    const hidden = kind === "dictations" ? pending : new Set([...pending, ...folded.sources]);
    return groupByDay(items, query, hidden, takeFilter(kind, app));
  }, [items, query, pending, folded, kind, app]);

  const timers = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; toast: string }>());
  const commitDelete = useCallback(
    async (id: string) => {
      const result = await runDelete({ environmentId, input: { id } });
      const interrupted = result._tag !== "Success" && isAtomCommandInterrupted(result);
      // An id the engine no longer has is already gone, which is what the user asked for.
      const gone =
        result._tag === "Success" ||
        (!interrupted && commandErrorReason(squashAtomCommandFailure(result)) === "not_found");
      setPending((current) => {
        const copy = new Set(current);
        copy.delete(id);
        return copy;
      });
      if (gone) {
        setDeleted((current) => new Set(current).add(id));
      } else if (!interrupted) {
        toastManager.add({
          type: "error",
          title: "Could not delete that dictation",
          description: "It is back in the list. Try again.",
        });
      }
    },
    [environmentId, runDelete],
  );

  const undoDelete = useCallback((id: string) => {
    const entry = timers.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    toastManager.close(entry.toast);
    timers.current.delete(id);
    setPending((current) => {
      const copy = new Set(current);
      copy.delete(id);
      return copy;
    });
  }, []);

  const startDelete = useCallback(
    (id: string) => {
      setPending((current) => new Set(current).add(id));
      const toast = toastManager.add({
        type: "info",
        title: "Deleted",
        timeout: UNDO_MS,
        actionProps: { children: "Undo", onClick: () => undoDelete(id) },
      });
      const timer = setTimeout(() => {
        timers.current.delete(id);
        void commitDelete(id);
      }, UNDO_MS);
      timers.current.set(id, { timer, toast });
    },
    [commitDelete, undoDelete],
  );

  // Leaving the tab commits what waits behind an Undo, because the toast cannot undo it any more.
  useEffect(() => {
    const waiting = timers.current;
    return () => {
      for (const [id, entry] of waiting) {
        clearTimeout(entry.timer);
        toastManager.close(entry.toast);
        void commitDelete(id);
      }
      waiting.clear();
    };
  }, [commitDelete]);

  const toggle = (set: ReadonlySet<string>, day: string): ReadonlySet<string> => {
    const copy = new Set(set);
    if (!copy.delete(day)) copy.add(day);
    return copy;
  };

  if (phase === "loading") return <TranscriptsSkeleton />;
  if (phase === "error") {
    return (
      <div className="flex flex-col items-start gap-2 text-sm" role="alert">
        <p>
          {live.connected === false
            ? "Scribe engine is not running. Start it from the tray, or install it."
            : "Could not load transcripts."}
        </p>
        <Button size="sm" variant="outline" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }
  if (items.length === 0 && pending.size === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MicIcon />
          </EmptyMedia>
          <EmptyTitle>No dictations yet</EmptyTitle>
          <EmptyDescription>
            Hold the hotkey and speak. Your dictations will show up here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const visibleGroups = groups.slice(0, shownDays);
  const moreLabel = moreDaysLabel(groups.length, shownDays);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-48 flex-1">
          <Input
            type="search"
            aria-label="Search transcripts"
            placeholder="Search what you said"
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              queryRef.current = value;
              setShownDays(DAYS_PER_PAGE);
              // Search covers the whole history, so read the older pages too.
              if (value.trim() !== "") void loadOlder();
            }}
          />
        </div>
        <ToggleGroup
          aria-label="Show"
          className="*:pointer-coarse:min-h-11"
          value={[kind]}
          onValueChange={(next) => {
            const value = next[0];
            if (value === "all" || value === "dictations" || value === "rewrites") setKind(value);
          }}
        >
          <Toggle value="all">All</Toggle>
          <Toggle value="dictations">Dictations</Toggle>
          <Toggle value="rewrites">Rewrites</Toggle>
        </ToggleGroup>
        <Select
          modal={false}
          value={app}
          onValueChange={(value: string | null) => setApp(value ?? ANY_APP)}
        >
          <SelectTrigger aria-label="App" className="w-44" size="sm">
            <SelectValue>
              {app === ANY_APP ? "Any app" : (apps.find((a) => a.key === app)?.label ?? app)}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value={ANY_APP}>Any app</SelectItem>
            {apps.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={showRaw}
          onClick={() => setShowRaw((current) => !current)}
        >
          {showRaw ? "Show cleaned text" : "Show what you said"}
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-start gap-2 text-sm">
          <p>
            {loadingMore
              ? "Searching your older dictations…"
              : moreFailed
                ? "Could not search your older dictations."
                : searching
                  ? `No match for “${query.trim()}”. Try other words, or clear the search.`
                  : "Nothing matches these filters. Pick All or Any app to see more."}
          </p>
          {moreFailed ? (
            <Button size="sm" variant="outline" onClick={() => void loadOlder()}>
              Try again
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setQuery("");
              queryRef.current = "";
              setKind("all");
              setApp(ANY_APP);
            }}
          >
            {searching ? "Clear search" : "Clear filters"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {visibleGroups.map((group) => (
            <DaySection
              key={group.day}
              group={group}
              today={now}
              collapsed={collapsedDays.has(group.day)}
              open={openDays.has(group.day)}
              showRaw={showRaw}
              folded={folded.rewrites}
              onToggleCollapsed={() => setCollapsedDays((current) => toggle(current, group.day))}
              onOpen={() => setOpenDays((current) => toggle(current, group.day))}
              onDelete={startDelete}
            />
          ))}
          {moreLabel ? (
            <Button
              variant="ghost"
              className="self-center"
              onClick={() => setShownDays((current) => current + DAYS_PER_PAGE)}
            >
              {moreLabel}
            </Button>
          ) : next !== null && !searching ? (
            <Button
              variant="ghost"
              className="self-center"
              disabled={loadingMore}
              onClick={() => void loadOlder()}
            >
              {loadingMore ? "Loading older dictations…" : "Load older dictations"}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DaySection(props: {
  readonly group: DayGroup;
  readonly today: Date;
  readonly collapsed: boolean;
  readonly open: boolean;
  readonly showRaw: boolean;
  readonly folded: ReadonlySet<string>;
  readonly onToggleCollapsed: () => void;
  readonly onOpen: () => void;
  readonly onDelete: (id: string) => void;
}) {
  const { group } = props;
  const rows = visibleDayItems(group, props.open);
  const count = group.items.length;
  const label = dayLabel(group.day, props.today);
  return (
    <section
      aria-label={label}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <button
        type="button"
        aria-expanded={!props.collapsed}
        onClick={props.onToggleCollapsed}
        className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3.5 py-2.5 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {props.collapsed ? (
          <ChevronRightIcon aria-hidden className="size-4" />
        ) : (
          <ChevronDownIcon aria-hidden className="size-4" />
        )}
        <span className="text-sm font-medium">{label}</span>
        <span className="ms-auto text-xs text-muted-foreground tabular-nums">
          {daySummary(group)}
        </span>
      </button>
      {props.collapsed ? null : (
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {rows.map((item) => (
            <TranscriptCard
              key={item.id}
              item={item}
              showRaw={props.showRaw}
              fromDictation={props.folded.has(item.id)}
              onDelete={props.onDelete}
            />
          ))}
        </ul>
      )}
      {props.collapsed || count <= rows.length ? null : (
        <Button variant="ghost" size="sm" className="m-1.5 self-start" onClick={props.onOpen}>
          Show all {count.toLocaleString("en-US")}
        </Button>
      )}
    </section>
  );
}

function TranscriptCard(props: {
  readonly item: ScribeHistoryItem;
  readonly showRaw: boolean;
  readonly fromDictation?: boolean;
  readonly onDelete: (id: string) => void;
}) {
  const { item } = props;
  const rewrite = rewriteLabel(item);
  // A rewrite always shows its result first and the original selection below it.
  const text =
    props.showRaw && rewrite === null ? item.rawText || item.cleanedText : item.cleanedText;
  const noun = rewrite === null ? "dictation" : "rewrite";
  const long = isLongTranscript(text);
  const [expanded, setExpanded] = useState(false);
  const meta = [
    item.app.replaceAll(".exe", "").trim(),
    `${item.words} ${item.words === 1 ? "word" : "words"}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex items-start gap-3 px-3.5 py-3">
      <span className="w-16 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">
        {timeLabel(item.at)}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm whitespace-pre-wrap", long && !expanded && "line-clamp-4")}>
          {text}
        </p>
        {long ? (
          <Button
            size="xs"
            variant="link"
            className="-ml-2"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show less" : "Show more"}
          </Button>
        ) : null}
        {rewrite !== null && item.rawText.trim() ? (
          <div className="mt-2 border-s-2 border-input ps-2.5">
            <p className="text-xs font-medium text-muted-foreground">
              {props.fromDictation ? "What you said" : "Original"}
            </p>
            <p className="mt-0.5 line-clamp-4 text-sm whitespace-pre-wrap text-muted-foreground">
              {item.rawText}
            </p>
          </div>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {rewrite !== null ? (
            <Badge variant="secondary" size="sm">
              {rewrite}
            </Badge>
          ) : null}
          <p className="text-xs text-muted-foreground">{meta}</p>
        </div>
      </div>
      <CopyButton text={text} label={`Copy ${noun}`} />
      <IconButton label={`Delete ${noun}`} onClick={() => props.onDelete(item.id)}>
        <Trash2Icon aria-hidden />
      </IconButton>
    </li>
  );
}

function TranscriptsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading transcripts">
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-4 w-24" />
      {[0, 1, 2, 3].map((key) => (
        <div key={key} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

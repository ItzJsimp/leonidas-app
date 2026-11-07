import type { EnvironmentId } from "@t3tools/contracts";
import { CopyIcon, PinIcon, Trash2Icon, VideoIcon } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RightPanelResizeHandle } from "~/components/preview/RightPanelResizeHandle";
import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "~/hooks/useResizableWidth";
import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { showAnchoredCopyErrorToast, showAnchoredCopySuccessToast } from "../ui/anchoredCopyToast";
import { Input } from "../ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Skeleton } from "../ui/skeleton";
import { toastManager } from "../ui/toast";
import { WindowHeader } from "../twoState/WindowHeader";
import {
  agentMention,
  filterMeetings,
  groupMeetings,
  formatClock,
  formatDay,
  formatLength,
  formatWhen,
  isBusy,
  meetingMarkdown,
  mergeSegments,
  parseMeetingDetail,
  parseMeetingList,
  stateLabel,
  type MeetingDetail,
  type MeetingSummary,
} from "./meetings.logic";
import { MeetingAsk, MeetingsLive } from "./MeetingsLive";
import { useMeetingsCall, type Call } from "./useMeetingsCall";

const POLL_MS = 4000;

const fail = (title: string, message: string | null) => {
  if (message !== null) toastManager.add({ type: "error", title, description: message });
};

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
  const [selected, setSelected] = useState<string | null>(null);
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

  const shown = useMemo(() => filterMeetings(items ?? [], query), [items, query]);
  const groups = useMemo(() => groupMeetings(shown), [shown]);
  const current = shown.find((item) => item.id === selected) ?? shown[0] ?? null;

  return (
    <>
      <WindowHeader title="Meetings" {...(items === null ? {} : { count: items.length })} />
      <MeetingsLive environmentId={environmentId} call={call} onChanged={load} />
      <div className="flex min-h-0 flex-1 flex-col bg-background md:flex-row">
        <nav
          aria-label="Meetings"
          style={{ [RESIZABLE_WIDTH_PROPERTY]: `${list.width}px` } as CSSProperties}
          className="relative flex max-h-72 min-h-0 shrink-0 flex-col gap-2 border-b bg-sidebar p-3 md:max-h-none md:w-[min(var(--resizable-width),calc(100%-20rem))] md:border-r md:border-b-0"
        >
          <Input
            aria-label="Search meetings"
            placeholder="Search title, app or person"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
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
              <p className="p-2 text-sm text-muted-foreground">
                {query.trim() === "" ? "No meetings yet." : "No meeting matches that search."}
              </p>
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
                          onSelect={() => setSelected(item.id)}
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
            className="-right-1 left-auto hidden md:block"
          />
        </nav>
        <section
          aria-label="Meeting"
          className="min-h-0 min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
        >
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

function MeetingReader(props: {
  readonly summary: MeetingSummary;
  readonly call: Call;
  readonly onChanged: () => Promise<void>;
  readonly onDeleted: () => void;
}) {
  const { summary, call } = props;
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);
  const [tab, setTab] = useState<"summary" | "transcript">("summary");
  // The list row changes when the engine finishes a step; read the full meeting again then.
  const version = `${summary.state}|${summary.notesState}|${summary.pinned}|${summary.hasTranscript}`;
  const latest = useRef(0);

  useEffect(() => {
    const ticket = ++latest.current;
    void call("GET", encodeURIComponent(summary.id)).then((result) => {
      if (ticket !== latest.current) return;
      const next = result.ok ? parseMeetingDetail(result.value) : null;
      if (next !== null) {
        setDetail(next);
        setFailed(null);
      } else if (!result.ok && result.message !== null) {
        setFailed(result.message);
      }
    });
    return () => {
      latest.current += 1;
    };
  }, [call, summary.id, version]);

  const act = async (
    label: string,
    method: "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ) => {
    setWorking(true);
    const result = await call(method, `${encodeURIComponent(summary.id)}${path}`, body);
    setWorking(false);
    if (!result.ok) return fail(label, result.message);
    if (method === "DELETE") return props.onDeleted();
    await props.onChanged();
  };

  const meeting = detail?.meeting ?? summary;
  const segments = useMemo(() => mergeSegments(detail?.segments ?? []), [detail]);
  const canTranscribe = meeting.hasAudio && (!meeting.hasTranscript || meeting.state === "failed");
  const noteLines = detail?.note ?? null;
  const hasNotes =
    noteLines !== null &&
    noteLines.summary.length + noteLines.decisions.length + noteLines.actionItems.length > 0;

  return (
    <article className="mx-auto flex min-h-full w-full max-w-[860px] flex-col gap-4 px-5 py-5 sm:px-9">
      <header className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-3xl leading-tight font-semibold text-balance">
              {meeting.title}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {[
                formatWhen(meeting.started),
                formatLength(meeting.durationMs),
                meeting.app,
                meeting.imported ? "From Python Scribe" : null,
              ]
                .filter((part) => part !== null && part !== "")
                .join(" · ")}
            </p>
          </div>
          {detail !== null ? (
            <CopyMenu
              items={[
                { label: "Copy as Markdown", text: meetingMarkdown(detail) },
                { label: "Copy line for an agent", text: agentMention(detail) },
                ...(detail.folder !== ""
                  ? [{ label: "Copy folder path", text: detail.folder }]
                  : []),
              ]}
            />
          ) : null}
        </div>
        {meeting.people.length > 0 ? (
          <ul aria-label="People" className="flex flex-wrap gap-1.5">
            {meeting.people.map((person) => (
              <li
                key={person}
                className="inline-flex h-6 items-center gap-1.5 rounded-full bg-muted pr-2 pl-0.5 text-xs"
              >
                <span
                  aria-hidden
                  className="grid size-[18px] place-items-center rounded-full bg-input text-3xs font-semibold"
                >
                  {person.slice(0, 1).toUpperCase()}
                </span>
                {person}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {failed !== null ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {failed}
        </p>
      ) : null}
      {meeting.transcribeError !== null ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {meeting.transcribeError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {canTranscribe ? (
          <Button
            size="sm"
            disabled={working || isBusy(meeting)}
            onClick={() => void act("Could not transcribe", "POST", "/transcribe")}
          >
            Transcribe
          </Button>
        ) : null}
        {meeting.hasTranscript && meeting.notesState !== "working" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={working}
            onClick={() => void act("Could not write notes", "POST", "/summary", {})}
          >
            {hasNotes ? "Write notes again" : "Write notes"}
          </Button>
        ) : null}
        {confirmDelete ? (
          <>
            <Button
              size="sm"
              variant="destructive"
              disabled={working}
              onClick={() => void act("Could not delete", "DELETE", "")}
            >
              Delete for good
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={meeting.state === "recording"}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2Icon aria-hidden />
            Delete
          </Button>
        )}
      </div>

      {meeting.notesState === "working" ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Writing notes…
        </p>
      ) : meeting.notesState === "failed" ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {meeting.notesError ?? "The notes could not be written. Try Write notes again."}
        </p>
      ) : null}

      <div role="tablist" aria-label="Meeting content" className="mt-1 flex gap-4.5 border-b">
        {(["summary", "transcript"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`meeting-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`meeting-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                setTab(id === "summary" ? "transcript" : "summary");
                event.preventDefault();
              }
            }}
            className={cn(
              "-mb-px border-b-2 py-2 text-sm font-medium capitalize transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
              tab === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {id}
          </button>
        ))}
      </div>

      {tab === "summary" ? (
        <div
          role="tabpanel"
          id="meeting-panel-summary"
          aria-labelledby="meeting-tab-summary"
          className="flex flex-col gap-5"
        >
          {noteLines !== null && hasNotes ? (
            <>
              <NoteList title="Summary" lines={noteLines.summary} />
              <NoteList title="Decisions" lines={noteLines.decisions} />
              <NoteList title="Action items" lines={noteLines.actionItems} />
              <NoteList title="Open questions" lines={noteLines.openQuestions} />
            </>
          ) : meeting.notesState === "working" ? null : (
            <p className="text-sm text-muted-foreground">
              {meeting.hasTranscript
                ? "No notes yet. Press Write notes to make a summary."
                : "Notes appear here after the meeting has a transcript."}
            </p>
          )}
          {meeting.hasTranscript ? (
            <MeetingAsk
              call={call}
              path={`${encodeURIComponent(summary.id)}/ask`}
              label="Ask about this meeting"
            />
          ) : null}
        </div>
      ) : (
        <div
          role="tabpanel"
          id="meeting-panel-transcript"
          aria-labelledby="meeting-tab-transcript"
          className="flex flex-col gap-3"
        >
          {detail === null && failed === null ? (
            <Skeleton className="h-24" />
          ) : segments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {meeting.state === "recording" || meeting.state === "processing"
                ? "This meeting is still recording. The live text shows above."
                : meeting.hasAudio
                  ? "This meeting has no transcript yet. Press Transcribe to make one."
                  : "This meeting has no transcript and no audio."}
            </p>
          ) : (
            segments.map((segment, index) => (
              <p key={`${index}-${segment.t0}`} className="text-sm leading-relaxed">
                <span className="font-medium">{segment.speaker}</span>{" "}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatClock(segment.t0)}
                </span>
                <br />
                {segment.text}
              </p>
            ))
          )}
        </div>
      )}
      {meeting.hasAudio ? (
        <footer className="mt-auto flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1">
            {meeting.pinned
              ? "The audio is kept. The transcript stays."
              : meeting.audioDeletesAt !== null
                ? `The audio is deleted on ${formatWhen(meeting.audioDeletesAt)}. The transcript stays.`
                : "The audio is saved with this meeting."}
          </span>
          <Button
            size="xs"
            variant="ghost"
            disabled={working}
            aria-pressed={meeting.pinned}
            onClick={() =>
              void act("Could not change that", "PATCH", "", { pinned: !meeting.pinned })
            }
          >
            {meeting.pinned ? "Audio kept" : "Keep audio"}
          </Button>
        </footer>
      ) : null}
    </article>
  );
}

function CopyMenu(props: {
  readonly items: readonly { readonly label: string; readonly text: string }[];
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const copy = (text: string) =>
    void navigator.clipboard.writeText(text).then(
      () => showAnchoredCopySuccessToast(ref),
      (error: unknown) =>
        showAnchoredCopyErrorToast(ref, error instanceof Error ? error : new Error(String(error))),
    );
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button ref={ref} size="sm" variant="outline">
            <CopyIcon aria-hidden />
            Copy
          </Button>
        }
      />
      <MenuPopup align="start">
        {props.items.map((item) => (
          <MenuItem key={item.label} onClick={() => copy(item.text)}>
            {item.label}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

function NoteList(props: { readonly title: string; readonly lines: readonly string[] }) {
  if (props.lines.length === 0) return null;
  return (
    <section aria-label={props.title} className="flex flex-col gap-1.5">
      <h3 className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
        {props.title}
      </h3>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        {props.lines.map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

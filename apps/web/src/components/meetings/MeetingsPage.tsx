import type { EnvironmentId } from "@t3tools/contracts";
import { PinIcon, Trash2Icon, VideoIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { CopyButton } from "../scribe/ScribeParts";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { toastManager } from "../ui/toast";
import { WindowHeader } from "../twoState/WindowHeader";
import {
  agentMention,
  filterMeetings,
  formatClock,
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
  const current = shown.find((item) => item.id === selected) ?? shown[0] ?? null;

  return (
    <>
      <WindowHeader title="Meetings" {...(items === null ? {} : { count: items.length })} />
      <MeetingsLive environmentId={environmentId} call={call} onChanged={load} />
      <div className="flex min-h-0 flex-1 flex-col bg-background md:flex-row">
        <nav
          aria-label="Meetings"
          className="flex max-h-72 min-h-0 shrink-0 flex-col gap-2 border-b p-3 md:max-h-none md:w-80 md:border-r md:border-b-0"
        >
          <Input
            aria-label="Search meetings"
            placeholder="Search title, app or person"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
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
              <ul className="flex flex-col gap-1">
                {shown.map((item) => (
                  <li key={item.id}>
                    <MeetingRow
                      item={item}
                      active={item.id === current?.id}
                      onSelect={() => setSelected(item.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </nav>
        <section aria-label="Meeting" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
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
        "flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
        props.active && "bg-accent",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
        {item.pinned ? <PinIcon aria-label="Audio kept" className="size-3.5 shrink-0" /> : null}
      </span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{formatWhen(item.started)}</span>
        <span>{formatLength(item.durationMs)}</span>
        {status !== null ? (
          <Badge variant={item.state === "failed" ? "destructive" : "outline"} size="sm">
            {status}
          </Badge>
        ) : null}
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
    <article className="mx-auto flex w-full max-w-[860px] flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-balance">{meeting.title}</h2>
        <p className="text-sm text-muted-foreground">
          {[
            formatWhen(meeting.started),
            formatLength(meeting.durationMs),
            meeting.app,
            meeting.imported ? "From Python Scribe" : null,
          ]
            .filter((part) => part !== null && part !== "")
            .join(" · ")}
        </p>
        {meeting.people.length > 0 ? (
          <p className="text-sm text-muted-foreground">{meeting.people.join(", ")}</p>
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
        {detail !== null ? (
          <>
            <ShareButton text={meetingMarkdown(detail)} label="Copy as Markdown" />
            <ShareButton text={agentMention(detail)} label="Copy line for an agent" />
            {detail.folder !== "" ? (
              <ShareButton text={detail.folder} label="Copy folder path" />
            ) : null}
          </>
        ) : null}
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
        {meeting.hasAudio ? (
          <Button
            size="sm"
            variant="outline"
            disabled={working}
            aria-pressed={meeting.pinned}
            onClick={() =>
              void act("Could not change that", "PATCH", "", { pinned: !meeting.pinned })
            }
          >
            {meeting.pinned ? "Audio kept" : "Keep audio"}
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
      {meeting.hasAudio && !meeting.pinned && meeting.audioDeletesAt !== null ? (
        <p className="text-xs text-muted-foreground">
          The audio is deleted on {formatWhen(meeting.audioDeletesAt)}. The transcript stays.
        </p>
      ) : null}

      {meeting.notesState === "working" ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Writing notes…
        </p>
      ) : meeting.notesState === "failed" ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {meeting.notesError ?? "The notes could not be written. Try Write notes again."}
        </p>
      ) : null}

      {noteLines !== null ? (
        <>
          <NoteList title="Summary" lines={noteLines.summary} />
          <NoteList title="Decisions" lines={noteLines.decisions} />
          <NoteList title="Action items" lines={noteLines.actionItems} />
          <NoteList title="Open questions" lines={noteLines.openQuestions} />
        </>
      ) : null}

      {meeting.hasTranscript ? (
        <MeetingAsk
          call={call}
          path={`${encodeURIComponent(summary.id)}/ask`}
          label="Ask about this meeting"
        />
      ) : null}

      <section aria-label="Transcript" className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Transcript</h3>
        {detail === null && failed === null ? (
          <Skeleton className="h-24" />
        ) : segments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {meeting.hasAudio
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
      </section>
    </article>
  );
}

function ShareButton(props: { readonly text: string; readonly label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <CopyButton text={props.text} label={props.label} />
      {props.label}
    </span>
  );
}

function NoteList(props: { readonly title: string; readonly lines: readonly string[] }) {
  if (props.lines.length === 0) return null;
  return (
    <section aria-label={props.title} className="flex flex-col gap-1.5">
      <h3 className="text-sm font-semibold">{props.title}</h3>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        {props.lines.map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

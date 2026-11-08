import { CopyIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { showAnchoredCopyErrorToast, showAnchoredCopySuccessToast } from "../ui/anchoredCopyToast";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Skeleton } from "../ui/skeleton";
import { toastManager } from "../ui/toast";
import {
  agentMention,
  formatClock,
  formatLength,
  formatWhen,
  isBusy,
  meetingMarkdown,
  mergeSegments,
  parseMeetingDetail,
  type MeetingDetail,
  type MeetingSummary,
  type MeetingTemplate,
} from "./meetings.logic";
import { MeetingAsk } from "./MeetingsLive";
import { MeetingTemplatePicker } from "./MeetingTemplatePicker";
import type { Call } from "./useMeetingsCall";

const fail = (title: string, message: string | null) => {
  if (message !== null) toastManager.add({ type: "error", title, description: message });
};

export function MeetingReader(props: {
  readonly summary: MeetingSummary;
  readonly call: Call;
  readonly onChanged: () => Promise<void>;
  readonly onDeleted: () => void;
  readonly templates: readonly MeetingTemplate[] | null;
  readonly templateError: string | null;
  readonly onRetryTemplates: () => void;
}) {
  const { summary, call } = props;
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);
  const [tab, setTab] = useState<"summary" | "transcript">("summary");
  const [nextTemplate, setNextTemplate] = useState<string | null>(null);
  const [writeTemplate, setWriteTemplate] = useState<string | null>(null);
  // The list row changes when the engine finishes a step; read the full meeting again then.
  const version = `${summary.state}|${summary.notesState}|${summary.pinned}|${summary.hasTranscript}|${summary.template}`;
  const latest = useRef(0);

  const loadDetail = useCallback(async () => {
    const ticket = ++latest.current;
    const result = await call("GET", encodeURIComponent(summary.id));
    if (ticket !== latest.current) return;
    const next = result.ok ? parseMeetingDetail(result.value) : null;
    if (next !== null) {
      setDetail(next);
      setFailed(null);
    } else if (!result.ok && result.message !== null) {
      setFailed(result.message);
    }
  }, [call, summary.id]);
  useEffect(() => {
    void loadDetail();
    return () => {
      latest.current += 1;
    };
  }, [loadDetail, version]);

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
    if (path === "/summary") await loadDetail();
  };

  const meeting = detail?.meeting ?? summary;
  const template = nextTemplate ?? meeting.template;
  const savedTemplateName = props.templates?.find((item) => item.id === meeting.template)?.name;
  const canWriteNotes = props.templates?.some((item) => item.id === template) === true;
  const writeTemplateName = props.templates?.find((item) => item.id === writeTemplate)?.name;
  const segments = useMemo(() => mergeSegments(detail?.segments ?? []), [detail]);
  const canTranscribe = meeting.hasAudio && (!meeting.hasTranscript || meeting.state === "failed");
  const noteLines = detail?.note ?? null;
  const hasNotes =
    noteLines !== null &&
    noteLines.summary.length + noteLines.decisions.length + noteLines.actionItems.length > 0;

  return (
    <article className="mx-auto flex min-h-full w-full max-w-[860px] flex-col gap-4 px-5 py-5 sm:px-9">
      <AlertDialog
        open={writeTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setWriteTemplate(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hasNotes ? "Write notes again?" : "Write meeting notes?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Use {writeTemplateName} with Groq GPT-OSS 120B, with GPT-OSS 20B as backup. Estimated
              cost: $0 on the free tier. This uses your Groq quota.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button
              onClick={() => {
                if (writeTemplate === null) return;
                const template = writeTemplate;
                setWriteTemplate(null);
                void act("Could not write notes", "POST", "/summary", { template });
              }}
            >
              Write notes
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
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

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-1">
        <div role="tablist" aria-label="Meeting content" className="flex gap-4.5">
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
          <MeetingTemplatePicker
            templates={props.templates}
            error={props.templateError}
            value={template}
            onChange={setNextTemplate}
            disabled={working || isBusy(meeting)}
            onRetry={props.onRetryTemplates}
          />
        ) : null}
      </div>

      {tab === "summary" ? (
        <div
          role="tabpanel"
          id="meeting-panel-summary"
          aria-labelledby="meeting-tab-summary"
          className="flex flex-col gap-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {savedTemplateName
                ? `Saved template: ${savedTemplateName}.`
                : "Choose a template for the next notes run."}
            </p>
            {meeting.hasTranscript && meeting.notesState !== "working" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={working || isBusy(meeting) || !canWriteNotes}
                title="Review the template, model and estimated cost before writing notes."
                onClick={() => setWriteTemplate(template)}
              >
                {hasNotes ? "Write notes again" : "Write notes"}
              </Button>
            ) : null}
          </div>
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

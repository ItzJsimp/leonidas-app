/** Meetings as the engine returns them (contract v1.6). Every reader below tolerates missing fields. */
export interface MeetingSummary {
  readonly id: string;
  readonly title: string;
  readonly started: string;
  readonly durationMs: number;
  readonly state: "recording" | "processing" | "transcribing" | "done" | "failed";
  readonly app: string | null;
  readonly people: readonly string[];
  readonly pinned: boolean;
  readonly imported: boolean;
  readonly hasTranscript: boolean;
  readonly hasAudio: boolean;
  readonly audioDeletesAt: string | null;
  readonly notesState: "working" | "done" | "failed" | null;
  readonly notesError: string | null;
  readonly transcribeError: string | null;
}

export interface MeetingSegment {
  readonly speaker: string;
  readonly t0: number;
  readonly text: string;
}

export interface MeetingNote {
  readonly summary: readonly string[];
  readonly decisions: readonly string[];
  readonly actionItems: readonly string[];
  readonly openQuestions: readonly string[];
}

export interface MeetingDetail {
  readonly meeting: MeetingSummary;
  readonly segments: readonly MeetingSegment[];
  readonly note: MeetingNote;
  readonly folder: string;
}

const STATES = ["recording", "processing", "transcribing", "done", "failed"] as const;

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const textOrNull = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

function parseSummary(raw: unknown): MeetingSummary | null {
  const row = record(raw);
  const id = text(row.id);
  if (id === "") return null;
  const state = STATES.find((candidate) => candidate === row.state) ?? "done";
  const notes = row.notesState;
  return {
    id,
    title: text(row.title) || "Untitled meeting",
    started: text(row.started),
    durationMs: typeof row.durationMs === "number" ? row.durationMs : 0,
    state,
    app: textOrNull(row.app),
    people: list(row.people).filter((person): person is string => typeof person === "string"),
    pinned: row.pinned === true,
    imported: row.imported === true,
    hasTranscript: row.hasTranscript === true,
    hasAudio: row.hasAudio === true,
    audioDeletesAt: textOrNull(row.audioDeletesAt),
    notesState: notes === "working" || notes === "done" || notes === "failed" ? notes : null,
    notesError: textOrNull(row.notesError),
    transcribeError: textOrNull(row.transcribeError),
  };
}

export function parseMeetingList(raw: unknown): readonly MeetingSummary[] {
  return list(record(raw).items).flatMap((item) => parseSummary(item) ?? []);
}

/** A note line is a string, or an object with a `text` (decision) or `task` and `owner` (action). */
const noteLine = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  const row = record(value);
  const task = text(row.task) || text(row.text);
  const owner = text(row.owner);
  return owner !== "" && task !== "" ? `${owner}: ${task}` : task.trim();
};
const noteLines = (value: unknown): readonly string[] =>
  list(value)
    .map(noteLine)
    .filter((line) => line !== "");

export function parseMeetingDetail(raw: unknown): MeetingDetail | null {
  const row = record(raw);
  const meeting = parseSummary(row);
  if (meeting === null) return null;
  const note = record(row.note);
  return {
    meeting,
    folder: text(row.folder),
    note: {
      summary: noteLines(note.summary),
      decisions: noteLines(note.decisions),
      actionItems: noteLines(note.action_items),
      openQuestions: noteLines(note.open_questions),
    },
    segments: list(row.transcript).flatMap((segment) => {
      const item = record(segment);
      const body = text(item.text).trim();
      if (body === "") return [];
      return [
        {
          speaker: text(item.speaker_key) || "Speaker",
          t0: typeof item.t0 === "number" ? item.t0 : 0,
          text: body,
        },
      ];
    }),
  };
}

/** Consecutive segments from one speaker read as one paragraph. */
export function mergeSegments(segments: readonly MeetingSegment[]): readonly MeetingSegment[] {
  const merged: MeetingSegment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.speaker === segment.speaker) {
      merged[merged.length - 1] = { ...last, text: `${last.text} ${segment.text}` };
    } else {
      merged.push(segment);
    }
  }
  return merged;
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const pad = (value: number) => String(value).padStart(2, "0");
  const rest = `${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return hours > 0 ? `${hours}:${rest}` : rest;
}

export function formatLength(durationMs: number): string {
  const minutes = Math.round(durationMs / 60_000);
  if (minutes < 1) return "Under 1 min";
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

export function formatWhen(started: string): string {
  const time = Date.parse(started);
  if (Number.isNaN(time)) return "";
  return new Date(time).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function filterMeetings(
  items: readonly MeetingSummary[],
  query: string,
): readonly MeetingSummary[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return items;
  return items.filter((item) =>
    [item.title, item.app ?? "", ...item.people].some((part) =>
      part.toLowerCase().includes(needle),
    ),
  );
}

/** True while the engine still works on the meeting, so the list keeps refreshing. */
export function isBusy(item: MeetingSummary): boolean {
  return (
    item.state === "recording" ||
    item.state === "processing" ||
    item.state === "transcribing" ||
    item.notesState === "working"
  );
}

export function stateLabel(item: MeetingSummary): string | null {
  if (item.state === "recording") return "Recording";
  if (item.state === "processing") return "Processing";
  if (item.state === "transcribing") return "Transcribing";
  if (item.state === "failed") return "Failed";
  if (item.notesState === "working") return "Writing notes";
  return null;
}

/** The whole meeting as Markdown: notes on top, transcript below. */
export function meetingMarkdown(detail: MeetingDetail): string {
  const { meeting, note } = detail;
  const out = [`# ${meeting.title}`, ""];
  const meta = [formatWhen(meeting.started), formatLength(meeting.durationMs), ...meeting.people]
    .filter((part) => part !== "")
    .join(" · ");
  if (meta !== "") out.push(meta, "");
  const section = (title: string, lines: readonly string[]) => {
    if (lines.length > 0) out.push(`## ${title}`, "", ...lines.map((line) => `- ${line}`), "");
  };
  section("Summary", note.summary);
  section("Decisions", note.decisions);
  section("Action items", note.actionItems);
  section("Open questions", note.openQuestions);
  const segments = mergeSegments(detail.segments);
  if (segments.length > 0) {
    out.push("## Transcript", "");
    for (const segment of segments) {
      out.push(`**${segment.speaker}** (${formatClock(segment.t0)}): ${segment.text}`, "");
    }
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/** One line to hand an agent so it can read the meeting. */
export function agentMention(detail: MeetingDetail): string {
  return `Read the meeting "${detail.meeting.title}" (${formatWhen(detail.meeting.started)}) in ${detail.folder}`;
}

export interface MeetingLive {
  readonly recording: boolean;
  readonly phase: "recording" | "finishing" | "done" | null;
  readonly elapsedMs: number;
  readonly levels: { readonly me: number; readonly them: number };
  readonly segments: readonly MeetingSegment[];
  readonly pending: number;
  readonly failed: number;
  readonly notices: readonly string[];
}

const clamp01 = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export function parseLive(raw: unknown): MeetingLive {
  const row = record(raw);
  const levels = record(row.levels);
  const phase =
    row.phase === "recording" || row.phase === "finishing" || row.phase === "done"
      ? row.phase
      : null;
  return {
    recording: row.recording === true,
    phase,
    elapsedMs: typeof row.elapsedMs === "number" ? row.elapsedMs : 0,
    levels: { me: clamp01(levels.me), them: clamp01(levels.them) },
    segments: list(row.segments).flatMap((segment) => {
      const item = record(segment);
      const body = text(item.text).trim();
      return body === ""
        ? []
        : [
            {
              speaker: text(item.speaker_key) || (item.track === "them" ? "Them" : "Me"),
              t0: typeof item.t0 === "number" ? item.t0 : 0,
              text: body,
            },
          ];
    }),
    pending: typeof row.pending === "number" ? row.pending : 0,
    failed: typeof row.failed === "number" ? row.failed : 0,
    notices: list(row.notices).filter((notice): notice is string => typeof notice === "string"),
  };
}

/** The call app that uses the mic now, or null. */
export function parseDetect(raw: unknown): string | null {
  return textOrNull(record(raw).app);
}

export interface DiscordStatus {
  readonly configured: boolean;
  readonly connected: boolean;
  readonly user: string | null;
}

export function parseDiscord(raw: unknown): DiscordStatus {
  const row = record(raw);
  const user = record(row.user);
  return {
    configured: row.configured === true,
    connected: row.connected === true,
    user: textOrNull(user.username) ?? textOrNull(user.name) ?? textOrNull(row.user),
  };
}

/** The clock for a running meeting, from the engine's elapsed time. */
export function elapsedLabel(elapsedMs: number): string {
  return formatClock(elapsedMs / 1000);
}

/** The newest lines for the live view, so a long call does not grow the page. */
export function liveTail(live: MeetingLive, count: number): readonly MeetingSegment[] {
  return mergeSegments(live.segments).slice(-count);
}

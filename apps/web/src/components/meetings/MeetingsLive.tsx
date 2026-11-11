import type { EnvironmentId } from "@t3tools/contracts";
import { CircleIcon, SquareIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toastManager } from "../ui/toast";
import { DiscordNamesCard } from "./DiscordNamesCard";
import { MeetingAudioPanel } from "./MeetingAudioPanel";
import {
  elapsedLabel,
  liveTail,
  loadChoice,
  NO_SOURCES,
  parseDetect,
  parseLive,
  parseSources,
  saveChoice,
  startBody,
  type AudioChoice,
  type AudioSources,
  type MeetingLive,
} from "./meetings.logic";
import type { Call } from "./useMeetingsCall";

const LIVE_POLL_MS = 1500;
const IDLE_POLL_MS = 6000;
const TAIL_LINES = 6;
const IDLE: MeetingLive = parseLive(null);

/** Record, stop and watch a meeting as it happens. Detects a call app and offers to record it. */
export function MeetingsLive(props: {
  readonly environmentId: EnvironmentId;
  readonly call: Call;
  readonly onChanged: () => Promise<void>;
}) {
  const { call, onChanged } = props;
  const [live, setLive] = useState<MeetingLive>(IDLE);
  const [detected, setDetected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sources, setSources] = useState<AudioSources>(NO_SOURCES);
  const [choice, setChoice] = useState<AudioChoice>(loadChoice);
  const toasted = useRef<string | null>(null);
  const wasRecording = useRef(false);
  // The toast and the button read the newest choice without restarting the poll.
  const latest = useRef({ choice, sources });
  useEffect(() => {
    latest.current = { choice, sources };
  }, [choice, sources]);

  const update = (next: AudioChoice) => {
    setChoice(next);
    saveChoice(next);
  };

  const start = useCallback(
    async (app: string | null) => {
      setBusy(true);
      const now = latest.current;
      const result = await call("POST", "start", startBody(now.choice, app, now.sources));
      setBusy(false);
      if (!result.ok && result.message !== null) {
        toastManager.add({ type: "error", title: "Could not start", description: result.message });
      }
      await onChanged();
    },
    [call, onChanged],
  );

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.hidden) return;
      const result = await call("GET", "live");
      if (cancelled || !result.ok) return;
      const next = parseLive(result.value);
      setLive(next);
      // A meeting that just ended appears in the list now.
      if (wasRecording.current && !next.recording) void onChanged();
      wasRecording.current = next.recording;
      if (next.recording) return setDetected(null);
      const found = await call("GET", "detect");
      const listed = await call("GET", "sources");
      if (!cancelled && listed.ok) setSources(parseSources(listed.value));
      if (cancelled || !found.ok) return;
      const app = parseDetect(found.value);
      setDetected(app);
      if (app !== null && toasted.current !== app) {
        toasted.current = app;
        toastManager.add({
          type: "info",
          title: `${app} call detected`,
          description: "Record this meeting?",
          actionProps: { children: "Record", onClick: () => void start(app) },
        });
      } else if (app === null) {
        toasted.current = null;
      }
    };
    void tick();
    const timer = setInterval(
      () => void tick(),
      live.recording || live.phase === "finishing" ? LIVE_POLL_MS : IDLE_POLL_MS,
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [call, live.recording, live.phase, onChanged, start]);

  const stop = async () => {
    setBusy(true);
    const result = await call("POST", "stop");
    setBusy(false);
    if (!result.ok && result.message !== null) {
      toastManager.add({ type: "error", title: "Could not stop", description: result.message });
    }
    await onChanged();
  };

  if (live.phase === "finishing") {
    return (
      <p className="border-b px-4 py-3 text-sm text-muted-foreground" aria-live="polite">
        Finishing the meeting: transcribing the last audio and writing notes…
      </p>
    );
  }

  if (!live.recording) {
    return (
      <div className="flex flex-col gap-2 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={busy} onClick={() => void start(detected)}>
            <CircleIcon aria-hidden className="fill-current text-destructive-foreground" />
            Record meeting
          </Button>
          <MeetingAudioPanel
            sources={sources}
            choice={choice}
            detected={detected}
            onChange={update}
          />
        </div>
        <DiscordNamesCard environmentId={props.environmentId} call={call} />
      </div>
    );
  }

  const tail = liveTail(live, TAIL_LINES);
  return (
    <div className="flex flex-col gap-3 border-b px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-medium" role="status">
          <span aria-hidden className="size-2.5 rounded-full bg-destructive" />
          Recording meeting
          <span className="tabular-nums text-muted-foreground">{elapsedLabel(live.elapsedMs)}</span>
        </span>
        <Level label="Your mic" value={live.levels.me} />
        <Level label="Call audio" value={live.levels.them} />
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => void stop()}>
          <SquareIcon aria-hidden className="fill-current" />
          Stop
        </Button>
      </div>
      {live.notices.map((notice) => (
        <p key={notice} role="alert" className="text-sm text-destructive-foreground">
          {notice}
        </p>
      ))}
      {live.failed > 0 ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {live.failed} part{live.failed === 1 ? "" : "s"} could not be transcribed. You can
          transcribe the meeting again when it ends.
        </p>
      ) : null}
      <div aria-label="Live transcript" className="flex flex-col gap-1 text-sm">
        {tail.length === 0 ? (
          <p className="text-muted-foreground">
            Text appears here about every 25 seconds{live.pending > 0 ? " (working…)" : ""}.
          </p>
        ) : (
          tail.map((segment, index) => (
            <p key={`${index}-${segment.t0}`}>
              <span className="font-medium">{segment.speaker}</span> {segment.text}
            </p>
          ))
        )}
      </div>
      <MeetingAsk call={call} path="live/ask" label="Ask about this meeting so far" />
    </div>
  );
}

function Level(props: { readonly label: string; readonly value: number }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {props.label}
      <span
        role="meter"
        aria-label={`${props.label} level`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(props.value * 100)}
        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full bg-primary transition-[width] motion-reduce:transition-none"
          style={{ width: `${Math.round(props.value * 100)}%` }}
        />
      </span>
    </span>
  );
}

/** One question to the notes model, answered from the transcript. */
export function MeetingAsk(props: {
  readonly call: Call;
  readonly path: string;
  readonly label: string;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    const trimmed = question.trim();
    if (trimmed === "") return;
    setAsking(true);
    setError(null);
    const result = await props.call("POST", props.path, { question: trimmed });
    setAsking(false);
    if (result.ok) {
      const value = result.value;
      const reply =
        typeof value === "object" && value !== null && "answer" in value
          ? (value as { answer: unknown }).answer
          : null;
      setAnswer(typeof reply === "string" ? reply : "The answer was empty. Try again.");
    } else if (result.message !== null) {
      setError(result.message);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <Input
          aria-label={props.label}
          placeholder={props.label}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={asking || question.trim() === ""}
        >
          {asking ? "Asking…" : "Ask"}
        </Button>
      </form>
      {error !== null ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      ) : null}
      {answer !== null ? (
        <p className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap" aria-live="polite">
          {answer}
        </p>
      ) : null}
    </div>
  );
}

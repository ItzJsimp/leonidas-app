import { useAtomValue } from "@effect/atom-react";
import {
  executeAtomQuery,
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { MicIcon, SquareIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { useEnvironmentQuery } from "../../state/query";
import { scribeLive, scribeStart, scribeStop } from "../../state/scribe";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { useSplitPane } from "../split/splitPaneContext";
import { commandErrorMessage, dictateButton } from "../scribe/home.logic";
import { INITIAL_SCRIBE_LIVE } from "../scribe/scribeLive.logic";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";
import { DiscordTip, shouldShowDiscordTip } from "./DiscordTip";
import { DiscordWalkthrough } from "./DiscordWalkthrough";
import { stepEngineTake, type EngineTake } from "./engineDictation";
import { VoiceSetup } from "./VoiceSetup";
import { recordVoice, voiceAudioBase64 } from "./recordVoice";
import { ScribePill } from "./ScribePill";
import { describeVoiceFailure } from "./voiceErrors";

export function ComposerVoiceButton({
  environmentId,
  disabled,
  onText,
  globalTrigger = false,
  onHoldChange,
}: {
  environmentId: EnvironmentId;
  disabled: boolean;
  onText: (text: string) => boolean;
  /** Answer the OS-wide dictation trigger (desktop) when this composer's pane is active. */
  globalTrigger?: boolean;
  /** True while a take, its audio or a message needs this button to stay mounted. */
  onHoldChange?: (held: boolean) => void;
}) {
  const [state, setState] = useState<"idle" | "starting" | "listening" | "writing" | "done">(
    "idle",
  );
  const [setup, setSetup] = useState(false);
  const [discordTip, setDiscordTip] = useState(false);
  const [discordSteps, setDiscordSteps] = useState(false);
  const [error, setError] = useState("");
  const [retainedText, setRetainedText] = useState("");
  const [seconds, setSeconds] = useState(0);
  /** The audio of a take that did not transcribe, kept for Retry until dismissed or replaced. */
  const [failedTake, setFailedTake] = useState<Blob | null>(null);
  const held = state !== "idle" || setup || discordSteps || Boolean(error || retainedText);
  useEffect(() => {
    onHoldChange?.(held);
    return () => onHoldChange?.(false);
  }, [held, onHoldChange]);
  const recording = useRef<ReturnType<typeof recordVoice> | null>(null);
  const active = useRef(true);
  const busy = useRef(false);
  // A global stop can arrive while the mic is still opening; apply it once the recording exists.
  const opening = useRef(false);
  const pendingEnd = useRef<"stop" | "cancel" | null>(null);
  const { active: paneActive } = useSplitPane();
  const insert = useRef(onText);
  useEffect(() => {
    insert.current = onText;
  }, [onText]);
  // One dictation system: on the desktop app the Scribe engine records, polishes and rewrites, the
  // same as Mouse 5. The in-app recorder below stays for browsers, where the engine's mic is not theirs.
  const live =
    useEnvironmentQuery(scribeLive({ environmentId, input: {} })).data ?? INITIAL_SCRIBE_LIVE;
  const viaEngine = Boolean(window.desktopBridge) && live.connected === true;
  const engineButton = dictateButton(live.connected, live.state);
  const take = useRef<EngineTake>("idle");
  const runStart = useAtomCommand(scribeStart, { reportFailure: false });
  const runStop = useAtomCommand(scribeStop, { reportFailure: false });
  const canEngine = useAtomValue(scribeStart.permissionAtom(environmentId));
  useEffect(() => {
    if (!viaEngine) return;
    const step = stepEngineTake(take.current, live.state, live.lastTranscript);
    take.current = step.take;
    if (step.insert !== null && !insert.current(`${step.insert} `)) setRetainedText(step.insert);
  }, [viaEngine, live.state, live.lastTranscript]);
  const pressEngine = async () => {
    if (engineButton.action === "none") return;
    setError("");
    // A take the composer did not start (a hotkey) is pasted by the engine; ours goes to onText.
    const result =
      engineButton.action === "start"
        ? await runStart({ environmentId, input: { mode: "toggle" } })
        : await runStop({ environmentId, input: { paste: take.current === "idle" } });
    if (engineButton.action === "start" && result._tag === "Success") take.current = "started";
    if (result._tag !== "Success" && !isAtomCommandInterrupted(result)) {
      setError(commandErrorMessage(squashAtomCommandFailure(result)));
    }
  };
  const transcribe = useAtomCommand(serverEnvironment.transcribeVoice, { reportFailure: false });
  const clear = useAtomCommand(serverEnvironment.clearVoiceKey, { reportFailure: false });
  const allowed = useAtomValue(serverEnvironment.transcribeVoice.permissionAtom(environmentId));
  const canClear = useAtomValue(serverEnvironment.clearVoiceKey.permissionAtom(environmentId));
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      recording.current?.cancel();
    };
  }, []);
  useEffect(() => {
    if (state !== "listening") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);
  /** Resolves true when the words reached the composer. A failure keeps the audio. */
  const write = async (blob: Blob) => {
    setState("writing");
    try {
      const audioBase64 = await voiceAudioBase64(blob);
      if (!active.current) return false;
      const result = await transcribe({
        environmentId,
        input: { audioBase64, mimeType: blob.type, polish: true },
      });
      if (!active.current) return false;
      if (result._tag !== "Success") throw squashAtomCommandFailure(result);
      setFailedTake(null);
      if (insert.current(`${result.value.text} `)) return true;
      setRetainedText(result.value.text);
      return false;
    } catch (failure) {
      if (active.current) setFailedTake(blob);
      throw failure;
    }
  };
  /** The pill says Pasted for a moment; a new take in that time keeps its own state. */
  const settle = (pasted: boolean) => {
    setState(pasted ? "done" : "idle");
    if (pasted)
      setTimeout(() => active.current && setState((now) => (now === "done" ? "idle" : now)), 1100);
  };
  const retry = async () => {
    if (busy.current || !failedTake) return;
    busy.current = true;
    setError("");
    let pasted = false;
    try {
      pasted = await write(failedTake);
    } catch (failure) {
      if (active.current) setError(describeVoiceFailure(failure));
    } finally {
      busy.current = false;
      if (active.current) settle(pasted);
    }
  };
  const start = async (viaGlobal = false) => {
    if (busy.current) {
      if (viaGlobal) void window.desktopBridge?.dictationEnded?.();
      return;
    }
    // Tells the desktop hook a composer owns this dictation; without it the hook ends it itself.
    if (viaGlobal) void window.desktopBridge?.dictationStarted?.();
    busy.current = true;
    opening.current = true;
    let pasted = false;
    setError("");
    setState("starting");
    try {
      const status = await executeAtomQuery(
        appAtomRegistry,
        serverEnvironment.voiceStatus({ environmentId, input: {} }),
        { refresh: true, reportFailure: false },
      );
      if (!active.current) return;
      if (status._tag !== "Success")
        throw new Error("Voice status is unavailable. Reconnect this computer and try again.");
      if (!status.value.keyConfigured) {
        setSetup(true);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("Microphone access needs the desktop app or an HTTPS connection.");
      }
      void shouldShowDiscordTip().then((show) => active.current && setDiscordTip(show));
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const session = recordVoice(stream);
      recording.current = session;
      opening.current = false;
      if (pendingEnd.current) session[pendingEnd.current]();
      setSeconds(0);
      setFailedTake(null);
      setState("listening");
      const blob = await session.result;
      recording.current = null;
      if (!blob || !active.current) return;
      pasted = await write(blob);
    } catch (failure) {
      if (active.current) setError(describeVoiceFailure(failure));
    } finally {
      busy.current = false;
      opening.current = false;
      pendingEnd.current = null;
      if (active.current) settle(pasted);
      // Releases the Discord mute key at once when setup, the mic or the transcription failed.
      if (viaGlobal) void window.desktopBridge?.dictationEnded?.();
    }
  };
  // The engine shows its own pill, so the button only mirrors its state.
  const shown = viaEngine
    ? live.state === "listening"
      ? "listening"
      : live.state === "processing"
        ? "writing"
        : "idle"
    : state;
  const levelOfTake = useCallback(() => recording.current?.level() ?? 0, []);
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });
  useEffect(() => {
    if (!globalTrigger || !paneActive) return;
    return window.desktopBridge?.onMenuAction((action) => {
      if (action === "dictation-start") return void startRef.current(true);
      const end =
        action === "dictation-stop" ? "stop" : action === "dictation-cancel" ? "cancel" : null;
      if (!end) return;
      if (recording.current) recording.current[end]();
      else if (opening.current) pendingEnd.current = end;
    });
  }, [globalTrigger, paneActive]);
  return (
    <>
      <div className="relative flex items-center gap-1">
        <Button
          type="button"
          variant={shown === "listening" ? "destructive" : "ghost"}
          size="icon"
          disabled={
            shown === "starting" ||
            shown === "writing" ||
            ((shown === "idle" || shown === "done") &&
              (disabled || !(viaEngine ? canEngine : allowed)))
          }
          aria-label={
            shown === "listening"
              ? "Stop dictation"
              : shown === "writing"
                ? "Writing dictation"
                : "Dictate a prompt"
          }
          title={
            shown === "listening"
              ? viaEngine
                ? "Stop dictation"
                : `Stop dictation (${seconds}s)`
              : "Dictate a prompt"
          }
          onPointerDown={(event) => event.preventDefault()}
          onClick={() =>
            viaEngine
              ? void pressEngine()
              : shown === "listening"
                ? recording.current?.stop()
                : void start()
          }
        >
          {shown === "listening" ? (
            <SquareIcon aria-hidden className="size-4" />
          ) : (
            <MicIcon aria-hidden className="size-4" />
          )}
        </Button>
        {shown === "starting" && (
          <span role="status" className="text-xs text-muted-foreground">
            Opening mic...
          </span>
        )}
        {!viaEngine && (state === "listening" || state === "writing" || state === "done") && (
          <ScribePill
            phase={state}
            seconds={seconds}
            level={levelOfTake}
            onStop={() => recording.current?.stop()}
            onCancel={() => recording.current?.cancel()}
          />
        )}
        {discordTip && (
          <DiscordTip
            onOpen={() => {
              setDiscordTip(false);
              setDiscordSteps(true);
            }}
            onDismiss={() => setDiscordTip(false)}
          />
        )}
        {(error || retainedText) && (
          <div className="absolute right-0 bottom-full z-20 mb-2 w-72 max-sm:-right-24 rounded-lg border bg-popover p-3 text-sm shadow-lg">
            {error && <p role="alert">{error}</p>}
            {retainedText && (
              <>
                <p>Dictation is ready. Insert it when the composer is available.</p>
                <textarea
                  aria-label="Saved dictation"
                  readOnly
                  value={retainedText}
                  className="mt-2 w-full"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (onText(`${retainedText} `)) setRetainedText("");
                  }}
                >
                  Insert text
                </Button>
              </>
            )}
            {error && failedTake && (
              <Button type="button" size="sm" onClick={() => void retry()}>
                Retry
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setError("");
                setRetainedText("");
                setFailedTake(null);
              }}
            >
              Dismiss
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSetup(true)}>
              Voice setup
            </Button>
          </div>
        )}
      </div>
      <DiscordWalkthrough open={discordSteps} onOpenChange={setDiscordSteps} />
      <Dialog open={setup} onOpenChange={setSetup}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Set up voice</DialogTitle>
            <DialogDescription>Connect your Groq key to dictate in Leonidas.</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <VoiceSetup environmentId={environmentId} onReady={() => setSetup(false)} />
          </DialogPanel>
          {canClear && (
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  const result = await clear({ environmentId, input: {} });
                  if (result._tag === "Success") setSetup(false);
                  else setError("The key could not be removed. Try again.");
                }}
              >
                Remove saved key
              </Button>
            </DialogFooter>
          )}
        </DialogPopup>
      </Dialog>
    </>
  );
}

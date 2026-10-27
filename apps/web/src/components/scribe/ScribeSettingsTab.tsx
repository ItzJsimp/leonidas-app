import {
  isAtomCommandInterrupted,
  type AtomCommandResult,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ScribeSettings } from "@t3tools/contracts";
import { XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useEnvironmentQuery } from "~/state/query";
import {
  scribeClearGroqKey,
  scribeDevicesQuery,
  scribePatchSettings,
  scribeSetGroqKey,
  scribeSettingsQuery,
} from "~/state/scribe";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { commandErrorReason } from "./home.logic";
import { KeyCaps } from "./ScribeParts";
import type { ScribeTabProps } from "./ScribePage";
import {
  addBinding,
  bindingFromKey,
  bindingFromMouse,
  checkGroqKey,
  clampMaxRecordSeconds,
  diffDraft,
  modelChoices,
  removeBinding,
  restartMessage,
  settingsErrorMessage,
  toDraft,
  type SettingsDraft,
} from "./settings.logic";

const WHISPER_MODELS = ["whisper-large-v3-turbo", "whisper-large-v3"];
const POLISH_MODELS = [
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
];
const SYSTEM_DEFAULT = "__system_default__";
const HOTKEY_ROWS = [
  { key: "hold", label: "Hold to talk", hint: "Speak while the shortcut is held down." },
  { key: "toggle", label: "Press to start and stop", hint: "Press once to start, again to stop." },
  { key: "cancel", label: "Cancel", hint: "Throws away the recording in progress." },
  {
    key: "rewrite",
    label: "Rewrite selected text",
    hint: "Opens the preset picker for the text you selected.",
  },
] as const;

export function ScribeSettingsTab({ environmentId, live }: ScribeTabProps) {
  const settingsQuery = useEnvironmentQuery(scribeSettingsQuery({ environmentId, input: {} }));
  const devicesQuery = useEnvironmentQuery(scribeDevicesQuery({ environmentId, input: {} }));
  const runPatch = useAtomCommand(scribePatchSettings, { reportFailure: false });
  const runSetKey = useAtomCommand(scribeSetGroqKey, { reportFailure: false });
  const runClearKey = useAtomCommand(scribeClearGroqKey, { reportFailure: false });
  const [saved, setSaved] = useState<ScribeSettings | null>(null);
  // `edits` holds the page's changes; null means nothing is edited, so a refresh never wipes one.
  const [edits, setEdits] = useState<SettingsDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const settings = saved ?? settingsQuery.data;
  const draft = edits ?? (settings === null ? null : toDraft(settings));

  // A failed read tries again once when the engine comes back.
  const previousConnected = useRef(live.connected);
  const { refresh, error } = settingsQuery;
  useEffect(() => {
    if (error !== null && live.connected === true && previousConnected.current !== true) refresh();
    previousConnected.current = live.connected;
  }, [live.connected, error, refresh]);

  const savedDraft = useMemo(() => (settings === null ? null : toDraft(settings)), [settings]);
  const patches = useMemo(
    () => (savedDraft === null || draft === null ? [] : diffDraft(savedDraft, draft)),
    [savedDraft, draft],
  );

  const fail = (result: AtomCommandResult<unknown, unknown> & { _tag: "Failure" }) => {
    if (!isAtomCommandInterrupted(result)) {
      toastManager.add({
        type: "error",
        title: settingsErrorMessage(commandErrorReason(squashAtomCommandFailure(result))),
      });
    }
  };

  const save = async () => {
    if (settings === null) return;
    setBusy(true);
    const restart: boolean[] = [];
    let next = settings;
    for (const patch of patches) {
      const result = await runPatch({ environmentId, input: patch });
      if (result._tag !== "Success") {
        // Sections saved so far stay saved; the rest stay in the draft.
        fail(result);
        break;
      }
      restart.push(result.value.restartRequired);
      next = {
        sections: {
          ...next.sections,
          [patch.section]: { ...next.sections[patch.section], ...result.value.values },
        },
      } as ScribeSettings;
      setSaved(next);
    }
    if (restart.length === patches.length) setEdits(null);
    setBusy(false);
    const note = restartMessage(restart);
    if (restart.length === patches.length && patches.length > 0) {
      toastManager.add({ type: "success", title: note ?? "Saved." });
    } else if (note !== null) {
      toastManager.add({ type: "info", title: note });
    }
  };

  /** The key has its own commands, so the saved copy is updated here. */
  const showKey = (isSet: boolean) => {
    if (settings === null) return;
    const { transcription } = settings.sections;
    setSaved({
      sections: {
        ...settings.sections,
        transcription: { ...transcription, groqKey: { set: isSet } },
      },
    });
  };

  const setKey = async (input: string): Promise<boolean> => {
    const checked = checkGroqKey(input);
    if (!checked.ok) {
      toastManager.add({ type: "warning", title: checked.message });
      return false;
    }
    setBusy(true);
    const result = await runSetKey({ environmentId, input: { key: checked.key } });
    setBusy(false);
    if (result._tag !== "Success") return (fail(result), false);
    showKey(true);
    toastManager.add({ type: "success", title: "Groq key saved." });
    return true;
  };

  const clearKey = async () => {
    setBusy(true);
    const result = await runClearKey({ environmentId, input: {} });
    setBusy(false);
    if (result._tag !== "Success") return fail(result);
    showKey(false);
    toastManager.add({ type: "info", title: "Groq key removed." });
  };

  if (settings === null || draft === null) {
    if (settingsQuery.error !== null) {
      return (
        <div className="flex flex-col items-start gap-2 text-sm" role="alert">
          <p>
            {live.connected === false
              ? "Scribe engine is not running."
              : "Could not load your settings."}
          </p>
          <Button size="sm" variant="outline" onClick={settingsQuery.refresh}>
            Try again
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const update = (change: (next: SettingsDraft) => void) =>
    setEdits((current) => {
      const base = current ?? (settings === null ? null : toDraft(settings));
      if (base === null) return current;
      const next = structuredClone(base);
      change(next);
      return next;
    });
  const { transcription, audio } = draft;
  const devices = devicesQuery.data?.inputs ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Section title="Shortcuts" note="Click Record, then press the keys or a mouse button.">
        {HOTKEY_ROWS.map((row) => (
          <HotkeyRow
            key={row.key}
            label={row.label}
            hint={row.hint}
            list={draft.hotkeys[row.key]}
            onChange={(list) => update((next) => void (next.hotkeys[row.key] = list))}
          />
        ))}
      </Section>

      <Section title="Microphone">
        <Field label="Input device">
          <Select
            value={audio.device ?? SYSTEM_DEFAULT}
            onValueChange={(value) =>
              update((next) => {
                next.audio.device = value === null || value === SYSTEM_DEFAULT ? null : value;
              })
            }
          >
            <SelectTrigger aria-label="Input device" className="w-full sm:w-72">
              <SelectValue>{audio.device ?? "System default"}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value={SYSTEM_DEFAULT}>System default</SelectItem>
              {modelChoices(
                audio.device ?? "",
                devices.map((d) => d.name),
              )
                .filter((name) => name !== "")
                .map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
            </SelectPopup>
          </Select>
        </Field>
        <Field label="Longest recording (seconds)">
          <Input
            type="number"
            className="w-32"
            aria-label="Longest recording in seconds"
            value={audio.maxRecordSeconds}
            min={15}
            max={900}
            onChange={(event) =>
              update((next) => {
                next.audio.maxRecordSeconds = clampMaxRecordSeconds(event.target.valueAsNumber);
              })
            }
          />
        </Field>
      </Section>

      <Section title="Transcription">
        <Toggler
          label="Clean up the text"
          hint="Fix punctuation and filler words after Scribe hears you."
          checked={transcription.polishEnabled}
          onChange={(value) => update((next) => void (next.transcription.polishEnabled = value))}
        />
        <Toggler
          label="Private mode"
          hint="Keep dictations out of the history list."
          checked={transcription.privateMode}
          onChange={(value) => update((next) => void (next.transcription.privateMode = value))}
        />
        <ModelField
          label="Speech model"
          value={transcription.whisperModel}
          known={WHISPER_MODELS}
          onChange={(value) => update((next) => void (next.transcription.whisperModel = value))}
        />
        <ModelField
          label="Backup speech model"
          value={transcription.whisperModelBackup}
          known={WHISPER_MODELS}
          onChange={(value) =>
            update((next) => void (next.transcription.whisperModelBackup = value))
          }
        />
        <ModelField
          label="Clean-up model"
          value={transcription.polishModel}
          known={POLISH_MODELS}
          onChange={(value) => update((next) => void (next.transcription.polishModel = value))}
        />
        <ModelField
          label="Backup clean-up model"
          value={transcription.backupPolishModel}
          known={POLISH_MODELS}
          onChange={(value) =>
            update((next) => void (next.transcription.backupPolishModel = value))
          }
        />
        <Field label="Clean-up instructions">
          <div className="flex w-full flex-col items-start gap-2">
            <Textarea
              aria-label="Clean-up instructions"
              placeholder="Leave empty to use the default instructions."
              value={transcription.polishInstructions ?? ""}
              onChange={(event) =>
                update((next) => {
                  next.transcription.polishInstructions =
                    event.target.value === "" ? null : event.target.value;
                })
              }
            />
            {transcription.polishInstructions !== null ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  update((next) => void (next.transcription.polishInstructions = null))
                }
              >
                Use the default
              </Button>
            ) : null}
          </div>
        </Field>
      </Section>

      <Section title="Overlay">
        <Toggler
          label="Show the recording overlay"
          hint="A small bar on screen while Scribe listens."
          checked={draft.hud.enabled}
          onChange={(value) => update((next) => void (next.hud.enabled = value))}
        />
      </Section>

      <GroqKeySection
        isSet={settings.sections.transcription.groqKey.set}
        busy={busy}
        onSet={setKey}
        onClear={clearKey}
      />

      <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t bg-background/95 p-3 backdrop-blur">
        <Button disabled={busy || patches.length === 0} onClick={() => void save()}>
          {busy ? "Saving" : "Save changes"}
        </Button>
        <Button
          variant="ghost"
          disabled={busy || patches.length === 0}
          onClick={() => setEdits(null)}
        >
          Discard
        </Button>
        {patches.length > 0 ? (
          <span className="text-sm text-muted-foreground" aria-live="polite">
            Unsaved changes
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Section(props: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">{props.title}</h2>
        {props.note ? <p className="text-sm text-muted-foreground">{props.note}</p> : null}
      </div>
      <div className="flex flex-col divide-y divide-border/60 rounded-lg border px-4">
        {props.children}
      </div>
    </section>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="sm:w-56 sm:pt-2">
        <Label>{props.label}</Label>
      </div>
      <div className="flex min-w-0 flex-1 sm:justify-end">{props.children}</div>
    </div>
  );
}

function Toggler(props: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{props.label}</p>
        <p className="text-sm text-muted-foreground">{props.hint}</p>
      </div>
      <Switch aria-label={props.label} checked={props.checked} onCheckedChange={props.onChange} />
    </div>
  );
}

function ModelField(props: {
  label: string;
  value: string;
  known: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={props.label}>
      <Select
        value={props.value}
        onValueChange={(value) => value !== null && props.onChange(value)}
      >
        <SelectTrigger aria-label={props.label} className="w-full sm:w-72">
          <SelectValue>{props.value}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {modelChoices(props.value, props.known).map((model) => (
            <SelectItem key={model} value={model}>
              {model}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </Field>
  );
}

function HotkeyRow(props: {
  label: string;
  hint: string;
  list: readonly string[];
  onChange: (list: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const { list, onChange } = props;

  const add = (input: string) => {
    const result = addBinding(list, input);
    if (!result.ok) {
      toastManager.add({ type: "warning", title: result.message });
      return;
    }
    onChange(result.list);
    setText("");
  };

  // Record waits for the next real key or mouse button, then stops.
  const addRef = useRef(add);
  useEffect(() => {
    addRef.current = add;
  });
  useEffect(() => {
    if (!recording) return;
    const finish = (binding: string | null, event: Event) => {
      if (binding === null) return;
      event.preventDefault();
      setRecording(false);
      addRef.current(binding);
    };
    const onKey = (event: KeyboardEvent) =>
      finish(
        bindingFromKey({
          ctrl: event.ctrlKey,
          shift: event.shiftKey,
          alt: event.altKey,
          meta: event.metaKey,
          key: event.key,
        }),
        event,
      );
    const onMouse = (event: MouseEvent) =>
      finish(
        bindingFromMouse({
          ctrl: event.ctrlKey,
          shift: event.shiftKey,
          alt: event.altKey,
          meta: event.metaKey,
          button: event.button,
        }),
        event,
      );
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onMouse, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onMouse, true);
    };
  }, [recording]);

  return (
    <div className="flex flex-col gap-2 py-3">
      <div>
        <p className="text-sm font-medium">{props.label}</p>
        <p className="text-sm text-muted-foreground">{props.hint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {list.map((binding) => (
          <span
            key={binding}
            className="inline-flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pl-1.5 pr-0.5"
          >
            <KeyCaps binding={binding} />
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Remove ${binding}`}
              onClick={() => onChange(removeBinding(list, binding))}
            >
              <XIcon />
            </Button>
          </span>
        ))}
        {list.length === 0 ? <span className="text-sm text-muted-foreground">None</span> : null}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add(text);
        }}
      >
        <Input
          className="w-56"
          aria-label={`Add a shortcut for ${props.label}`}
          placeholder="Ctrl + Shift + T"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <Button type="submit" size="sm" variant="outline" disabled={text.trim() === ""}>
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant={recording ? "default" : "outline"}
          aria-pressed={recording}
          onClick={() => setRecording((value) => !value)}
        >
          {recording ? "Press the keys now" : "Record"}
        </Button>
      </form>
    </div>
  );
}

function GroqKeySection(props: {
  isSet: boolean;
  busy: boolean;
  onSet: (key: string) => Promise<boolean>;
  onClear: () => Promise<void>;
}) {
  const [key, setKey] = useState("");
  return (
    <Section
      title="Groq key"
      note="Scribe sends your speech to Groq. The key stays in the system credential store and is never shown again."
    >
      <div className="flex flex-col gap-2 py-3">
        <p className="text-sm" aria-live="polite">
          {props.isSet ? "A key is saved." : "No key saved."}
        </p>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await props.onSet(key)) setKey("");
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            className="w-72"
            aria-label="Groq key"
            placeholder="gsk_..."
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={props.busy || key.trim() === ""}>
            {props.isSet ? "Replace key" : "Save key"}
          </Button>
          {props.isSet ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={props.busy}
              onClick={() => void props.onClear()}
            >
              Remove key
            </Button>
          ) : null}
        </form>
      </div>
    </Section>
  );
}

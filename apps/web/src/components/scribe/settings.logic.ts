import type { ScribeSettings } from "@t3tools/contracts";

type Sections = ScribeSettings["sections"];
type Transcription = Sections["transcription"];

/** The engine binds this when the settings carry no `rewrite` list (contract v1.4). */
const DEFAULT_REWRITE_KEY = "Ctrl + Shift + A";

/** The rewrite shortcuts. A missing list means the engine default; an empty list means none. */
export function rewriteBindings(hotkeys: Sections["hotkeys"]): string[] {
  const value: unknown = (hotkeys as { rewrite?: unknown }).rewrite;
  if (!Array.isArray(value)) return [DEFAULT_REWRITE_KEY];
  return value.filter((item): item is string => typeof item === "string");
}

/** "Ctrl + Shift + A" as its key caps: ["Ctrl", "Shift", "A"]. */
export function bindingKeys(binding: string): string[] {
  return binding
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** What the page edits. The Groq key is never part of it: it has its own commands. */
export interface SettingsDraft {
  hotkeys: { hold: string[]; toggle: string[]; cancel: string[]; rewrite: string[] };
  audio: { -readonly [K in keyof Sections["audio"]]: Sections["audio"][K] };
  transcription: { -readonly [K in keyof Omit<Transcription, "groqKey">]: Transcription[K] };
  hud: { -readonly [K in keyof Sections["hud"]]: Sections["hud"][K] };
}

export function toDraft(settings: ScribeSettings): SettingsDraft {
  const { hotkeys, audio, transcription, hud } = settings.sections;
  const { groqKey: _groqKey, ...rest } = transcription;
  return structuredClone({
    hotkeys: {
      hold: [...hotkeys.hold],
      toggle: [...hotkeys.toggle],
      cancel: [...hotkeys.cancel],
      rewrite: rewriteBindings(hotkeys),
    },
    audio,
    transcription: rest,
    hud,
  });
}

const DRAFT_SECTIONS = ["hotkeys", "audio", "transcription", "hud"] as const;

/** One PATCH per changed section, carrying only the changed keys. */
export function diffDraft(
  saved: SettingsDraft,
  draft: SettingsDraft,
): Array<{ section: (typeof DRAFT_SECTIONS)[number]; values: Record<string, unknown> }> {
  const patches = [];
  for (const section of DRAFT_SECTIONS) {
    const before = saved[section] as Record<string, unknown>;
    const after = draft[section] as Record<string, unknown>;
    const values: Record<string, unknown> = {};
    for (const key of Object.keys(after)) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) values[key] = after[key];
    }
    if (Object.keys(values).length > 0) patches.push({ section, values });
  }
  return patches;
}

const MODIFIERS = ["Ctrl", "Shift", "Alt", "Win"] as const;
const NAMED_KEYS: Readonly<Record<string, string>> = {
  mouse4: "Mouse4",
  mouse5: "Mouse5",
  middle: "Middle",
  escape: "Escape",
  enter: "Enter",
  tab: "Tab",
  space: "Space",
};

function canonicalKey(part: string): string | null {
  const lower = part.toLowerCase();
  if (NAMED_KEYS[lower] !== undefined) return NAMED_KEYS[lower];
  if (/^f([1-9]|1\d|2[0-4])$/.test(lower)) return lower.toUpperCase();
  return /^[a-z0-9]$/.test(lower) ? lower.toUpperCase() : null;
}

type Parsed = { ok: true; text: string } | { ok: false; message: string };

/** Parse the way the engine does and return the canonical text, modifiers first. */
function parseBinding(input: string): Parsed {
  const parts = input.split("+").map((part) => part.trim());
  if (parts.some((part) => part === "")) {
    return { ok: false, message: "Write the shortcut like Ctrl + Shift + T." };
  }
  const mods = new Set<string>();
  const keys: string[] = [];
  for (const part of parts) {
    const mod = MODIFIERS.find((name) => name.toLowerCase() === part.toLowerCase());
    if (mod !== undefined) {
      mods.add(mod);
      continue;
    }
    const key = canonicalKey(part);
    if (key === null) return { ok: false, message: `Scribe does not know the key "${part}".` };
    keys.push(key);
  }
  if (keys.length > 1) return { ok: false, message: "Use one key or mouse button per shortcut." };
  if (keys.length === 0 && !mods.has("Win")) {
    return { ok: false, message: "Add one key or mouse button, not only Ctrl, Shift, Alt or Win." };
  }
  return { ok: true, text: [...MODIFIERS.filter((m) => mods.has(m)), ...keys].join(" + ") };
}

export function validateBinding(input: string): string | null {
  const parsed = parseBinding(input);
  return parsed.ok ? null : parsed.message;
}

interface Modifiers {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

function withModifiers(event: Modifiers, key: string): string {
  const mods = [
    event.ctrl && "Ctrl",
    event.shift && "Shift",
    event.alt && "Alt",
    event.meta && "Win",
  ].filter((m): m is string => m !== false);
  return [...mods, key].join(" + ");
}

export function bindingFromKey(event: Modifiers & { key: string }): string | null {
  const key = canonicalKey(event.key === " " ? "space" : event.key);
  return key === null || key.startsWith("Mouse") || key === "Middle"
    ? null
    : withModifiers(event, key);
}

const MOUSE_BUTTONS: Readonly<Record<number, string>> = { 1: "Middle", 3: "Mouse4", 4: "Mouse5" };

export function bindingFromMouse(event: Modifiers & { button: number }): string | null {
  const name = MOUSE_BUTTONS[event.button];
  return name === undefined ? null : withModifiers(event, name);
}

export function addBinding(
  list: readonly string[],
  input: string,
): { ok: true; list: string[] } | { ok: false; message: string } {
  const parsed = parseBinding(input);
  if (!parsed.ok) return parsed;
  if (list.some((item) => item.toLowerCase() === parsed.text.toLowerCase())) {
    return { ok: false, message: "That shortcut is already in the list." };
  }
  return { ok: true, list: [...list, parsed.text] };
}

export function removeBinding(list: readonly string[], item: string): string[] {
  return list.filter((entry) => entry !== item);
}

/** The Qt range for the longest recording. */
export function clampMaxRecordSeconds(value: number): number {
  return Number.isFinite(value) ? Math.min(900, Math.max(15, Math.round(value))) : 600;
}

export function modelChoices(current: string, known: readonly string[]): string[] {
  return [current, ...known.filter((model) => model !== current)];
}

export function checkGroqKey(
  input: string,
): { ok: true; key: string } | { ok: false; message: string } {
  const key = input.trim().replace(/^["']|["']$/g, "");
  if (key === "") return { ok: false, message: "Paste your Groq key first." };
  if (!/^gsk_\S+$/.test(key) || key.length > 200) {
    return { ok: false, message: "That does not look like a Groq key. It starts with gsk_." };
  }
  return { ok: true, key };
}

/** How long a copied key stays on the clipboard. */
const KEY_CLIPBOARD_MS = 30_000;

/**
 * Copies the key, then empties the clipboard after `KEY_CLIPBOARD_MS`. The timer is not tied to the page,
 * so closing the tab does not leave the key behind. shortcut: a clipboard that cannot be read is emptied
 * anyway, which may drop text the user copied meanwhile; upgrade if the browser gains a safe compare.
 */
export async function copyKeyTemporarily(
  key: string,
  clipboard: Pick<Clipboard, "readText" | "writeText">,
  schedule: (run: () => void, ms: number) => unknown = setTimeout,
): Promise<void> {
  await clipboard.writeText(key);
  schedule(() => {
    void clipboard
      .readText()
      .then(
        (now) => (now === key ? clipboard.writeText("") : undefined),
        () => clipboard.writeText(""),
      )
      .catch(() => undefined);
  }, KEY_CLIPBOARD_MS);
}

export function restartMessage(restartRequired: readonly boolean[]): string | null {
  return restartRequired.some(Boolean)
    ? "Saved. Model and overlay changes apply the next time the Scribe engine starts."
    : null;
}

const SETTINGS_ERRORS: Readonly<Record<string, string>> = {
  offline: "Scribe engine is not running. Start it from the tray, or install it.",
  timeout: "Scribe did not answer in time. Try again.",
  bad_request: "Scribe did not accept those settings. Check the values and try again.",
  store_error: "Scribe could not save your settings. Try again.",
  not_found: "No Groq key is saved.",
};

export function settingsErrorMessage(reason: string | null): string {
  return (
    (reason === null ? undefined : SETTINGS_ERRORS[reason]) ??
    "Scribe could not do that. Try again."
  );
}

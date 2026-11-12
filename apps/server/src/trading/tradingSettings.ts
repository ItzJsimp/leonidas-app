import { TradingStateError, type TradingSettings } from "@t3tools/contracts";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

const SETTINGS_FILE = "settings.json";
/** A bigger file is unreadable. The app never needs that much text here. */
const MAX_SETTINGS_BYTES = 100 * 1024;
const MAX_FEE_CAP = 1_000_000;

interface SettingsObject {
  [key: string]: unknown;
  monthlyFeeCap?: unknown;
}

const isFeeCap = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && value >= 0 && value <= MAX_FEE_CAP);

/** The keys the app may write, each with its check. Every other key stays in the file as it is. */
const CHECKS = { monthlyFeeCap: isFeeCap } as const;
type TradingSettingKey = keyof typeof CHECKS;

const JsonText = Schema.fromJsonString(Schema.Unknown);
const decodeJson = Schema.decodeUnknownOption(JsonText);
const encodeJson = Schema.encodeSync(JsonText);

/** Null means unreadable: bad JSON, not an object, or an app key with a bad value. */
const parseSettings = (text: string): SettingsObject | null => {
  const value = Option.getOrUndefined(decodeJson(text));
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const object = value as SettingsObject;
  const bad = (Object.keys(CHECKS) as TradingSettingKey[]).some(
    (key) => key in object && !CHECKS[key](object[key]),
  );
  return bad ? null : object;
};

/** A missing file reads as no keys. Null means the file exists but cannot be read. Never throws. */
const readSettingsObject = Effect.fn("trading.readSettings")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(root, "trading", SETTINGS_FILE);
  // A check that fails counts as present, so a save never overwrites a file it could not check.
  if (!(yield* fs.exists(file).pipe(Effect.orElseSucceed(() => true))))
    return {} satisfies SettingsObject;
  const text = yield* fs.stat(file).pipe(
    Effect.flatMap((info) =>
      Number(info.size) > MAX_SETTINGS_BYTES ? Effect.succeed(null) : fs.readFileString(file),
    ),
    Effect.orElseSucceed(() => null),
  );
  return text === null ? null : parseSettings(text);
});

const settingsView = (object: SettingsObject): TradingSettings => ({
  monthlyFeeCap: typeof object.monthlyFeeCap === "number" ? object.monthlyFeeCap : null,
});

/** The app's settings as the UI reads them. `settingsUnreadable` is true when the file cannot be read. */
export const readTradingSettings = (root: string) =>
  readSettingsObject(root).pipe(
    Effect.map((object) => ({
      settings: settingsView(object ?? {}),
      settingsUnreadable: object === null,
    })),
  );

/**
 * Sets one allowed key and keeps every other key in `trading/settings.json`. A file that cannot be
 * read is never overwritten, so a bad file never loses the trader's other settings.
 */
export const saveTradingSetting = Effect.fn("trading.saveSetting")(function* (
  root: string,
  key: TradingSettingKey,
  value: unknown,
) {
  if (!CHECKS[key](value)) {
    return yield* new TradingStateError({ reason: "invalid_settings", detail: key });
  }
  const object = yield* readSettingsObject(root);
  if (object === null) return yield* new TradingStateError({ reason: "read_failed" });
  const next = { ...object, [key]: value };
  const path = yield* Path.Path;
  yield* writeFileStringAtomically({
    filePath: path.join(root, "trading", SETTINGS_FILE),
    contents: `${encodeJson(next)}\n`,
  }).pipe(Effect.mapError(() => new TradingStateError({ reason: "read_failed" })));
  return settingsView(next);
});

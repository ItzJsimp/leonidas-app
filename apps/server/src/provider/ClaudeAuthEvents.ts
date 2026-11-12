import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

/**
 * A small append-only log of Claude sign-in changes, so the next unexpected
 * sign-out leaves evidence. The server trace rotates within hours, so this
 * file is separate and capped. It records timing and events only: never a
 * token, an email address or a full path.
 */

const MAX_LOG_BYTES = 256 * 1024;
const CREDENTIALS_FILE = ".credentials.json";

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const decodeCredentials = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      claudeAiOauth: Schema.optional(
        Schema.Struct({
          expiresAt: Schema.optional(Schema.Number),
          refreshTokenExpiresAt: Schema.optional(Schema.Number),
          refreshToken: Schema.optional(Schema.String),
          subscriptionType: Schema.optional(Schema.String),
        }),
      ),
    }),
  ),
);

export interface ClaudeCredentialMeta {
  readonly file: "missing" | "unreadable" | "present";
  readonly modifiedAt?: string;
  readonly accessExpiresAt?: string | null;
  readonly refreshExpiresAt?: string | null;
  readonly hasRefreshToken?: boolean;
  readonly subscriptionType?: string | null;
}

export type ClaudeAuthEventName = "state-changed" | "logout-run" | "auth-flow-ended";

export interface ClaudeAuthEventLog {
  /** Record a probe result. Writes only when the sign-in state or the credentials changed. */
  readonly observe: (probe: {
    readonly authStatus: string;
    readonly connectionIssue?: string | undefined;
  }) => Effect.Effect<void>;
  /** Record an action Leonidas itself ran. */
  readonly record: (event: "logout-run" | "auth-flow-ended") => Effect.Effect<void>;
}

const iso = (millis: number | undefined): string | null =>
  millis === undefined ? null : DateTime.formatIso(DateTime.makeUnsafe(millis));

export const readClaudeCredentialMeta = Effect.fn("readClaudeCredentialMeta")(function* (
  configDir: string,
): Effect.fn.Return<ClaudeCredentialMeta, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(configDir, CREDENTIALS_FILE);
  const info = yield* fileSystem.stat(file).pipe(Effect.option);
  if (Option.isNone(info)) return { file: "missing" };
  const modifiedAt = Option.getOrUndefined(info.value.mtime)?.toISOString();
  const text = yield* fileSystem.readFileString(file).pipe(Effect.option);
  if (Option.isNone(text)) return { file: "unreadable", ...(modifiedAt ? { modifiedAt } : {}) };
  const decoded = decodeCredentials(text.value);
  if (Option.isNone(decoded)) return { file: "unreadable", ...(modifiedAt ? { modifiedAt } : {}) };
  const oauth = decoded.value.claudeAiOauth;
  return {
    file: "present",
    ...(modifiedAt ? { modifiedAt } : {}),
    accessExpiresAt: iso(oauth?.expiresAt),
    refreshExpiresAt: iso(oauth?.refreshTokenExpiresAt),
    hasRefreshToken: Boolean(oauth?.refreshToken),
    subscriptionType: oauth?.subscriptionType ?? null,
  };
});

export const makeClaudeAuthEventLog = Effect.fn("makeClaudeAuthEventLog")(function* (input: {
  readonly logPath: string;
  readonly configDir: string;
  readonly instanceId: string;
}): Effect.fn.Return<ClaudeAuthEventLog, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let lastKey = "";

  // shortcut: read, trim and append are not atomic across instances; a rare lost line is fine for a debug log.
  const append = (event: ClaudeAuthEventName) =>
    Effect.gen(function* () {
      yield* fileSystem.makeDirectory(path.dirname(input.logPath), { recursive: true });
      const size = yield* fileSystem.stat(input.logPath).pipe(
        Effect.map((info) => Number(info.size)),
        Effect.orElseSucceed(() => 0),
      );
      if (size > MAX_LOG_BYTES) {
        const text = yield* fileSystem.readFileString(input.logPath);
        const newest = text.slice(Math.floor(text.length / 2));
        const firstLine = newest.indexOf("\n");
        yield* fileSystem.writeFileString(
          input.logPath,
          firstLine < 0 ? "" : newest.slice(firstLine + 1),
        );
      }
      const at = DateTime.formatIso(DateTime.makeUnsafe(yield* Clock.currentTimeMillis));
      yield* fileSystem.writeFileString(
        input.logPath,
        `${encodeJson({ at, event, instanceId: input.instanceId })}\n`,
        { flag: "a" },
      );
    }).pipe(Effect.ignore);

  return {
    observe: (probe) =>
      Effect.gen(function* () {
        const credentials = yield* readClaudeCredentialMeta(input.configDir).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
        );
        const key = encodeJson([probe.authStatus, probe.connectionIssue ?? null, credentials]);
        if (key === lastKey) return;
        lastKey = key;
        yield* append("state-changed");
      }),
    record: (event) => append(event),
  };
});

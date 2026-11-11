import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { makeClaudeAuthEventLog, readClaudeCredentialMeta } from "./ClaudeAuthEvents.ts";

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

const setup = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "claude-auth-events-" });
  const configDir = path.join(root, ".claude-test");
  yield* fileSystem.makeDirectory(configDir);
  yield* fileSystem.writeFileString(
    path.join(configDir, ".credentials.json"),
    encodeJson({
      claudeAiOauth: {
        accessToken: "SECRET-ACCESS",
        refreshToken: "SECRET-REFRESH",
        expiresAt: Date.UTC(2026, 10, 10, 23, 46),
        refreshTokenExpiresAt: Date.UTC(2026, 11, 9, 11, 16),
        subscriptionType: "pro",
        email: "someone@example.com",
      },
    }),
  );
  const logPath = path.join(root, "logs", "claude-auth-events.ndjson");
  const readLines = () =>
    fileSystem.readFileString(logPath).pipe(
      Effect.map((text) =>
        text
          .split("\n")
          .filter(Boolean)
          .map((line) => decodeJson(line) as Record<string, any>),
      ),
    );
  const size = () => fileSystem.stat(logPath).pipe(Effect.map((info) => Number(info.size)));
  return { configDir, logPath, fileSystem, path, readLines, size };
});

it.layer(NodeServices.layer)("ClaudeAuthEvents", (it) => {
  it.effect("reads expiry and token presence, never the tokens", () =>
    Effect.gen(function* () {
      const { configDir } = yield* setup;
      const meta = yield* readClaudeCredentialMeta(configDir);
      assert.equal(meta.file, "present");
      assert.equal(meta.hasRefreshToken, true);
      assert.equal(meta.refreshExpiresAt, "2026-12-09T11:16:00.000Z");
      assert.notInclude(encodeJson(meta), "SECRET");
    }).pipe(Effect.scoped),
  );

  it.effect("logs a sign-out once, with no secrets, and ignores repeat probes", () =>
    Effect.gen(function* () {
      const { configDir, logPath, fileSystem, readLines } = yield* setup;
      const log = yield* makeClaudeAuthEventLog({ logPath, configDir, instanceId: "claude-j" });
      yield* log.observe({ authStatus: "authenticated" });
      yield* log.observe({ authStatus: "authenticated" });
      yield* log.observe({ authStatus: "unauthenticated", connectionIssue: "token_expired" });
      yield* log.observe({ authStatus: "unauthenticated", connectionIssue: "token_expired" });
      const events = yield* readLines();
      assert.deepEqual(
        events.map((e) => [e.authStatus, e.connectionIssue]),
        [
          ["authenticated", null],
          ["unauthenticated", "token_expired"],
        ],
      );
      assert.equal(events[0]!.configDirName, ".claude-test");
      const text = yield* fileSystem.readFileString(logPath);
      for (const secret of ["SECRET", "someone@example.com", configDir]) {
        assert.notInclude(text, secret);
      }
    }).pipe(Effect.scoped),
  );

  it.effect("records a logout that Leonidas ran", () =>
    Effect.gen(function* () {
      const { configDir, logPath, readLines } = yield* setup;
      const log = yield* makeClaudeAuthEventLog({ logPath, configDir, instanceId: "claude-j" });
      yield* log.record("logout-run");
      assert.equal((yield* readLines())[0]!.event, "logout-run");
    }).pipe(Effect.scoped),
  );

  it.effect("keeps the file under its size cap and keeps the newest lines", () =>
    Effect.gen(function* () {
      const { configDir, logPath, fileSystem, path, readLines, size } = yield* setup;
      yield* fileSystem.makeDirectory(path.dirname(logPath), { recursive: true });
      yield* fileSystem.writeFileString(
        logPath,
        `${encodeJson({ old: "x".repeat(990) })}\n`.repeat(300),
      );
      assert.isAbove(yield* size(), 256 * 1024);
      const log = yield* makeClaudeAuthEventLog({ logPath, configDir, instanceId: "claude-j" });
      yield* log.observe({ authStatus: "unauthenticated" });
      assert.isBelow(yield* size(), 256 * 1024);
      assert.equal((yield* readLines()).at(-1)!.authStatus, "unauthenticated");
    }).pipe(Effect.scoped),
  );
});

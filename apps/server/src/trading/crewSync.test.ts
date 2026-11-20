// @effect-diagnostics nodeBuiltinImport:off - tests use real files and real git in temp folders.
// @effect-diagnostics globalDate:off - the sync state carries an ISO time.
import { assert, describe, it } from "@effect/vitest";
import { buildCrewCard, DEFAULT_SHARE, deriveTradingState, type CrewCard } from "@t3tools/trading";
import * as Effect from "effect/Effect";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { readCrewView, safeRemote, syncCrew, type RunGit } from "./crewSync.ts";

const ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
const IDENTITY = ["-c", "user.name=Test", "-c", "user.email=test@example.invalid"];

const git = (cwd: string, ...args: string[]) =>
  NodeChildProcess.execFileSync("git", [...IDENTITY, ...args], { cwd, env: ENV, encoding: "utf8" });

// The app runs these same Git commands through the Git workflow service. Real Git runs here.
const run: RunGit = (cwd, args) =>
  Effect.sync(() => {
    const result = NodeChildProcess.spawnSync("git", [...args], {
      cwd,
      env: ENV,
      encoding: "utf8",
    });
    return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
  });

const card = (name: string): CrewCard =>
  buildCrewCard({
    state: deriveTradingState({ events: [], trades: [] }),
    trades: [],
    name,
    share: DEFAULT_SHARE,
    now: new Date("2026-03-21T00:00:00Z"),
  });

interface Install {
  readonly root: string;
  readonly pack: string;
}
interface World {
  readonly remote: string;
  readonly a: Install;
  readonly b: Install;
}

/** A bare remote with a `main` pack, and two installs that each have a pack checkout. */
function makeWorld(): World {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "crew-sync-"));
  const remote = NodePath.join(dir, "remote.git");
  git(dir, "init", "--bare", "--initial-branch=main", remote);
  const seed = NodePath.join(dir, "seed");
  git(dir, "clone", "--quiet", remote, seed);
  NodeFS.writeFileSync(NodePath.join(seed, "trading-pack.json"), "{}\n");
  git(seed, "add", ".");
  git(seed, "commit", "--quiet", "-m", "pack");
  git(seed, "push", "--quiet", "origin", "HEAD:main");
  const install = (name: string): Install => {
    const root = NodePath.join(dir, name);
    const pack = NodePath.join(dir, `${name}-pack`);
    NodeFS.mkdirSync(NodePath.join(root, "trading"), { recursive: true });
    git(dir, "clone", "--quiet", remote, pack);
    return { root, pack };
  };
  return { remote, a: install("a"), b: install("b") };
}

const sync = (install: Install, cardValue: CrewCard, now = "2026-03-21T00:00:00Z", runner = run) =>
  syncCrew(runner, {
    root: install.root,
    packFolder: install.pack,
    card: cardValue,
    now: new Date(now),
  });

const raceTime = new Date("2026-03-21T00:05:00Z");
const traders = (view: { readonly cards: readonly CrewCard[] }) => view.cards.map((c) => c.trader);

describe("crew sync", () => {
  it.effect("shows a change from clone A in clone B after one sync cycle", () =>
    Effect.gen(function* () {
      const world = makeWorld();
      const first = yield* sync(world.a, card("Ada"));
      assert.strictEqual(first.status, "synced");
      assert.deepStrictEqual(traders(first), ["ada"]);
      const second = yield* sync(world.b, card("Bo"));
      assert.strictEqual(second.status, "synced");
      assert.deepStrictEqual(traders(second), ["ada", "bo"]);
      const third = yield* sync(world.a, card("Ada"), "2026-03-21T00:03:00Z");
      assert.deepStrictEqual(traders(third), ["ada", "bo"]);
    }),
  );

  it.effect("never writes main or any file outside crew/", () =>
    Effect.gen(function* () {
      const world = makeWorld();
      const mainBefore = git(world.remote, "rev-parse", "main").trim();
      const outbox = NodePath.join(world.a.root, "trading", "crew-outbox");
      NodeFS.mkdirSync(outbox, { recursive: true });
      NodeFS.writeFileSync(NodePath.join(outbox, "tip-1.md"), "a tip\n");
      yield* sync(world.a, card("Ada"));
      yield* sync(world.b, card("Bo"));
      assert.strictEqual(git(world.remote, "rev-parse", "main").trim(), mainBefore);
      const lines = (ref: string) =>
        git(world.remote, "ls-tree", "-r", "--name-only", ref).split("\n").filter(Boolean);
      const packFiles = lines("main");
      // The crew branch starts from the pack. Every file Crew sync added is under crew/.
      const added = lines("crew").filter((name) => !packFiles.includes(name));
      assert.deepStrictEqual(added.toSorted(), [
        "crew/ada.json",
        "crew/bo.json",
        "crew/resources/ada-tip-1.md",
      ]);
      assert.isFalse(packFiles.some((name) => name.startsWith("crew/")));
      // The trader's own pack checkout is untouched.
      assert.strictEqual(git(world.a.pack, "status", "--porcelain").trim(), "");
      assert.strictEqual(git(world.a.pack, "branch", "--show-current").trim(), "main");
    }),
  );

  it.effect("moves outbox resources once and skips names that are not plain outbox files", () =>
    Effect.gen(function* () {
      const world = makeWorld();
      const outbox = NodePath.join(world.a.root, "trading", "crew-outbox");
      NodeFS.mkdirSync(outbox, { recursive: true });
      NodeFS.writeFileSync(NodePath.join(outbox, "good-1.md"), "ok\n");
      NodeFS.writeFileSync(NodePath.join(outbox, "..evil.md"), "no\n");
      NodeFS.writeFileSync(NodePath.join(outbox, "Bad Name.md"), "no\n");
      NodeFS.writeFileSync(NodePath.join(outbox, "big-1.md"), "x".repeat(60_000));
      yield* sync(world.a, card("Ada"));
      assert.deepStrictEqual(NodeFS.readdirSync(outbox).toSorted(), [
        "..evil.md",
        "Bad Name.md",
        "big-1.md",
      ]);
      const files = git(world.remote, "ls-tree", "-r", "--name-only", "crew");
      assert.include(files, "crew/resources/ada-good-1.md");
      assert.notInclude(files, "evil");
    }),
  );

  it.effect("recovers when another install pushes between the fetch and the push", () =>
    Effect.gen(function* () {
      const world = makeWorld();
      yield* sync(world.a, card("Ada"));
      let injected = false;
      const racing: RunGit = (cwd, args) =>
        Effect.gen(function* () {
          if (!injected && args.includes("push") && cwd.startsWith(world.a.root)) {
            injected = true;
            yield* syncCrew(run, {
              root: world.b.root,
              packFolder: world.b.pack,
              card: card("Bo"),
              now: raceTime,
            });
          }
          return yield* run(cwd, args);
        });
      const result = yield* sync(world.a, card("Ada"), "2026-03-21T00:06:00Z", racing);
      assert.isTrue(injected);
      assert.strictEqual(result.status, "synced");
      assert.deepStrictEqual(traders(result), ["ada", "bo"]);
    }),
  );

  it.effect("keeps the last sync time and the cards when the remote cannot be reached", () =>
    Effect.gen(function* () {
      const world = makeWorld();
      const ok = yield* sync(world.a, card("Ada"), "2026-03-21T10:00:00Z");
      assert.strictEqual(ok.status, "synced");
      NodeFS.renameSync(world.remote, `${world.remote}.gone`);
      const failed = yield* sync(world.a, card("Ada"), "2026-03-21T10:03:00Z");
      assert.strictEqual(failed.status, "offline");
      assert.strictEqual(failed.lastSyncAt, "2026-03-21T10:00:00.000Z");
      assert.deepStrictEqual(traders(failed), ["ada"]);
      NodeFS.renameSync(`${world.remote}.gone`, world.remote);
      const retried = yield* sync(world.a, card("Ada"), "2026-03-21T10:06:00Z");
      assert.strictEqual(retried.status, "synced");
      assert.strictEqual(retried.lastSyncAt, "2026-03-21T10:06:00.000Z");
    }),
  );

  it.effect(
    "reads cards from the clone with no network and skips files that are not valid cards",
    () =>
      Effect.gen(function* () {
        const world = makeWorld();
        yield* sync(world.a, card("Ada"));
        const dir = NodePath.join(world.a.root, "trading", "crew-sync", "crew");
        NodeFS.writeFileSync(
          NodePath.join(dir, "bo.json"),
          '{"version":1,"trader":"someone-else"}',
        );
        NodeFS.writeFileSync(NodePath.join(dir, "junk.json"), "not json");
        const view = readCrewView(world.a.root);
        assert.deepStrictEqual(traders(view), ["ada"]);
        assert.strictEqual(view.skippedCards, 2);
      }),
  );

  it.effect(
    "refuses a trader name that is not a safe file name and a remote that is not a plain URL",
    () =>
      Effect.gen(function* () {
        const world = makeWorld();
        const result = yield* sync(world.a, { ...card("Ada"), trader: "../x" });
        assert.strictEqual(result.status, "error");
        assert.isFalse(
          NodeFS.existsSync(NodePath.join(world.a.root, "trading", "crew-sync", "crew")),
        );
        for (const url of ["ext::sh -c touch /tmp/x", "--upload-pack=x", "", "file with space"]) {
          assert.isFalse(safeRemote(url), url);
        }
        for (const url of [
          "https://example.invalid/team/pack.git",
          "git@example.invalid:team/pack.git",
          world.remote,
        ]) {
          assert.isTrue(safeRemote(url), url);
        }
      }),
  );
});

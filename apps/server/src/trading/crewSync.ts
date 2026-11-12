// @effect-diagnostics nodeBuiltinImport:off - the sync reads and writes plain files in its own clone.
// Crew sync: one file per trader on a `crew` branch of the pack repo. The sync works in its own
// clone under `trading/crew-sync/`, never in the trader's pack checkout, and it pushes only `crew`.
import { parseCrewCard, traderSlug, type CrewCard } from "@t3tools/trading";
import * as Effect from "effect/Effect";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

/**
 * What the sync needs from Git. In the app this is the Git workflow service. The caller must set
 * GIT_TERMINAL_PROMPT=0 and GCM_INTERACTIVE=never, so an expired sign-in fails fast and shows as
 * offline and never blocks on a prompt.
 */
export type RunGit = (
  cwd: string,
  args: readonly string[],
) => Effect.Effect<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }>;

export const CREW_BRANCH = "crew";
/** Files under `crew/` the sync may write: one card per trader and shared resources. */
const CARD_DIR = "crew";
const RESOURCE_DIR = "crew/resources";
const MAX_RESOURCE_BYTES = 50_000;
const MAX_RESOURCES = 50;
const MAX_CARDS = 50;
const STATE_FILE = "crew-sync-state.json";
const RESOURCE_NAME = /^[0-9a-z][0-9a-z-]{0,80}\.md$/;
const PUSH_TRIES = 3;

export type CrewSyncStatus = "synced" | "offline" | "no_remote" | "error";

export interface CrewSyncState {
  /** ISO time of the last sync that reached the remote. Null before the first one. */
  readonly lastSyncAt: string | null;
  readonly status: CrewSyncStatus | "never";
  readonly detail: string | null;
}

export interface CrewView extends CrewSyncState {
  readonly cards: readonly CrewCard[];
  readonly skippedCards: number;
}

const inside = (folder: string, file: string): boolean => {
  const relative = NodePath.relative(folder, file);
  return relative !== "" && !relative.startsWith("..") && !NodePath.isAbsolute(relative);
};

/** An https, ssh or plain local path. `ext::` and option-like values never pass. */
export function safeRemote(url: string): boolean {
  const text = url.trim();
  if (text === "" || text.startsWith("-") || text.includes("\0") || text.includes("::"))
    return false;
  if (/^https:\/\/[^\s]+$/.test(text) || /^ssh:\/\/[^\s]+$/.test(text)) return true;
  if (/^[\w.-]+@[\w.-]+:[^\s]+$/.test(text)) return true;
  return NodePath.isAbsolute(text);
}

const readState = (cloneRoot: string): CrewSyncState => {
  try {
    const value = JSON.parse(
      NodeFS.readFileSync(NodePath.join(cloneRoot, "..", STATE_FILE), "utf8"),
    );
    const lastSyncAt = typeof value.lastSyncAt === "string" ? value.lastSyncAt : null;
    const status = ["synced", "offline", "no_remote", "error"].includes(value.status)
      ? value.status
      : "never";
    return {
      lastSyncAt,
      status,
      detail: typeof value.detail === "string" ? value.detail.slice(0, 300) : null,
    };
  } catch {
    return { lastSyncAt: null, status: "never", detail: null };
  }
};

const writeState = (cloneRoot: string, state: CrewSyncState) => {
  const file = NodePath.join(cloneRoot, "..", STATE_FILE);
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  NodeFS.writeFileSync(temp, `${JSON.stringify(state)}\n`);
  NodeFS.renameSync(temp, file);
};

/** The cards in the clone, read from disk. Needs no network. Invalid files are counted, not read. */
export function readCrewView(root: string): CrewView {
  const clone = NodePath.join(root, "trading", "crew-sync");
  const state = readState(clone);
  const cards: CrewCard[] = [];
  let skipped = 0;
  const dir = NodePath.join(clone, CARD_DIR);
  let names: string[] = [];
  try {
    names = NodeFS.readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .toSorted();
  } catch {
    // no clone yet
  }
  for (const name of names.slice(0, MAX_CARDS)) {
    const file = NodePath.join(dir, name);
    try {
      const info = NodeFS.lstatSync(file);
      if (!info.isFile() || info.size > 20_000) throw new Error("not a card file");
      const card = parseCrewCard(NodeFS.readFileSync(file, "utf8"));
      // A card must sit in the file named for its trader.
      if (card === null || `${card.trader}.json` !== name) throw new Error("bad card");
      cards.push(card);
    } catch {
      skipped += 1;
    }
  }
  return { ...state, cards, skippedCards: skipped + Math.max(0, names.length - MAX_CARDS) };
}

const offline = (stderr: string) =>
  /could not resolve host|unable to access|network is unreachable|connection (timed out|refused|reset)|timed out|failed to connect|could not read from remote|authentication failed|terminal prompts disabled/i.test(
    stderr,
  );

/** Copies outbox resources into `crew/resources/` of the clone. Returns the outbox names copied. */
function copyOutbox(root: string, clone: string, slug: string): string[] {
  const outbox = NodePath.join(root, "trading", "crew-outbox");
  const copied: string[] = [];
  let names: string[] = [];
  try {
    names = NodeFS.readdirSync(outbox);
  } catch {
    return copied;
  }
  const target = NodePath.join(clone, RESOURCE_DIR);
  for (const name of names.slice(0, MAX_RESOURCES)) {
    if (!RESOURCE_NAME.test(name)) continue;
    const source = NodePath.join(outbox, name);
    try {
      const info = NodeFS.lstatSync(source);
      if (!info.isFile() || info.size > MAX_RESOURCE_BYTES) continue;
      NodeFS.mkdirSync(target, { recursive: true });
      const destination = NodePath.join(target, `${slug}-${name}`);
      if (!inside(clone, destination)) continue;
      NodeFS.writeFileSync(destination, NodeFS.readFileSync(source));
      copied.push(name);
    } catch {
      // one bad file never stops the sync
    }
  }
  return copied;
}

export interface SyncInput {
  readonly root: string;
  /** The pack checkout. Only its `origin` URL is read. */
  readonly packFolder: string;
  readonly card: CrewCard;
  readonly now: Date;
}

/**
 * One sync cycle: update the clone from `origin/crew`, write this trader's card and shared
 * resources, commit, and push `crew`. Never touches the pack checkout and never pushes any other ref.
 */
export const syncCrew = Effect.fn("trading.syncCrew")(function* (run: RunGit, input: SyncInput) {
  const { root, packFolder, card } = input;
  const slug = traderSlug(card.trader);
  const clone = NodePath.join(root, "trading", "crew-sync");
  const git = (args: readonly string[], cwd = clone) => run(cwd, args);

  function finish(status: CrewSyncStatus, detail: string | null) {
    return Effect.sync(() => {
      const previous = readState(clone);
      const next: CrewSyncState = {
        lastSyncAt: status === "synced" ? input.now.toISOString() : previous.lastSyncAt,
        status,
        detail,
      };
      try {
        writeState(clone, next);
      } catch {
        // a state file that cannot be written only loses the last sync time
      }
      return readCrewView(root);
    });
  }

  if (slug !== card.trader)
    return yield* finish("error", "The trader name is not a valid file name.");

  const remote = yield* git(["remote", "get-url", "origin"], packFolder);
  const url = remote.stdout.trim();
  if (remote.exitCode !== 0 || !safeRemote(url)) {
    return yield* finish("no_remote", "The pack has no usable origin remote.");
  }

  NodeFS.mkdirSync(NodePath.dirname(clone), { recursive: true });
  if (!NodeFS.existsSync(NodePath.join(clone, ".git"))) {
    const cloned = yield* git(
      ["clone", "--quiet", "--no-checkout", "--", url, clone],
      NodePath.dirname(clone),
    );
    if (cloned.exitCode !== 0) {
      return yield* finish(
        offline(cloned.stderr) ? "offline" : "error",
        cloned.stderr.slice(0, 300),
      );
    }
  }

  const fetched = yield* git(["fetch", "--quiet", "origin"]);
  if (fetched.exitCode !== 0) {
    return yield* finish(
      offline(fetched.stderr) ? "offline" : "error",
      fetched.stderr.slice(0, 300),
    );
  }
  // The local `crew` branch follows `origin/crew`. A new crew starts from the remote default branch.
  const hasRemoteCrew =
    (yield* git(["rev-parse", "--verify", "--quiet", `origin/${CREW_BRANCH}`])).exitCode === 0;
  if (hasRemoteCrew) {
    const switched = yield* git([
      "checkout",
      "--quiet",
      "--force",
      "-B",
      CREW_BRANCH,
      `origin/${CREW_BRANCH}`,
    ]);
    if (switched.exitCode !== 0) return yield* finish("error", switched.stderr.slice(0, 300));
  } else {
    const head = yield* git(["rev-parse", "--verify", "--quiet", "origin/HEAD"]);
    const base = head.exitCode === 0 ? "origin/HEAD" : "HEAD";
    const switched = yield* git(["checkout", "--quiet", "--force", "-B", CREW_BRANCH, base]);
    if (switched.exitCode !== 0) return yield* finish("error", switched.stderr.slice(0, 300));
  }

  // Write this trader's files. Both targets sit under `crew/` and are checked again before commit.
  const cardFile = NodePath.join(clone, CARD_DIR, `${slug}.json`);
  if (!inside(clone, cardFile)) return yield* finish("error", "The card path leaves the clone.");
  NodeFS.mkdirSync(NodePath.dirname(cardFile), { recursive: true });
  // @effect-diagnostics-next-line preferSchemaOverJson:off - the card is a plain object built by buildCrewCard.
  NodeFS.writeFileSync(cardFile, `${JSON.stringify(card, null, 2)}\n`);
  const copied = copyOutbox(root, clone, slug);

  yield* git(["add", "--", CARD_DIR]);
  const staged = yield* git(["diff", "--cached", "--name-only"]);
  const names = staged.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  // Sync never writes outside `crew/`. A stray path unstages everything and stops.
  if (names.some((name) => !name.startsWith(`${CARD_DIR}/`))) {
    yield* git(["reset", "--quiet"]);
    return yield* finish("error", "A file outside crew/ was staged. Nothing was pushed.");
  }
  if (names.length > 0) {
    const committed = yield* git([
      "-c",
      `user.name=${card.name}`,
      "-c",
      "user.email=crew@leonidas.invalid",
      "commit",
      "--quiet",
      "--no-verify",
      "-m",
      `crew: ${slug} sync`,
    ]);
    if (committed.exitCode !== 0) return yield* finish("error", committed.stderr.slice(0, 300));
  }

  // Push only `crew`. Another trader's push in between is rebased over: card files never overlap.
  for (let attempt = 1; attempt <= PUSH_TRIES; attempt += 1) {
    const pushed = yield* git([
      "push",
      "--quiet",
      "origin",
      `${CREW_BRANCH}:refs/heads/${CREW_BRANCH}`,
    ]);
    if (pushed.exitCode === 0) {
      for (const name of copied) {
        try {
          NodeFS.rmSync(NodePath.join(root, "trading", "crew-outbox", name), { force: true });
        } catch {
          // an outbox file that stays is copied again next cycle, with the same name
        }
      }
      return yield* finish("synced", null);
    }
    if (offline(pushed.stderr)) return yield* finish("offline", pushed.stderr.slice(0, 300));
    const refreshed = yield* git(["fetch", "--quiet", "origin", CREW_BRANCH]);
    if (refreshed.exitCode !== 0)
      return yield* finish(
        offline(refreshed.stderr) ? "offline" : "error",
        refreshed.stderr.slice(0, 300),
      );
    const rebased = yield* git(["rebase", "--quiet", `origin/${CREW_BRANCH}`]);
    if (rebased.exitCode !== 0) {
      yield* git(["rebase", "--abort"]);
      return yield* finish("error", "Another install changed this card. Sync again to retry.");
    }
  }
  return yield* finish("error", "The Crew branch kept changing. Sync again to retry.");
});

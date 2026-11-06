import type { ContentActor, ContentStage } from "@t3tools/contracts";

import { identityArgs, realGit, type Git } from "../areaSync/engine/git.ts";
import { DEALS_DIR, parseFile, sections } from "./contentFiles.ts";

/** The trailer that marks an agent draft: the "before" side of every edit pair. */
const BASELINE_TRAILER = "Script-Baseline: yes";

export const videoRel = (deal: string, file: string) => `${DEALS_DIR}/${deal}/${file}.md`;

export type Change =
  | {
      readonly actor: ContentActor;
      readonly what: "script" | "video";
      readonly deal: string;
      readonly file: string;
    }
  | {
      readonly actor: ContentActor;
      readonly what: "stage";
      readonly deal: string;
      readonly file: string;
      readonly to: ContentStage;
    }
  | { readonly actor: ContentActor; readonly what: "deal"; readonly deal: string }
  | {
      readonly actor: ContentActor;
      readonly what: "proposal";
      readonly deal: string;
      readonly outcome: "proposed" | "dismissed";
    };

export interface Recorded {
  readonly committed: boolean;
  /** Why nothing was committed, in git's words. Empty after a commit. */
  readonly detail: string;
}

const who = (actor: ContentActor) => (actor.kind === "agent" ? "agent" : actor.name);

const chains = new Map<string, Promise<unknown>>();
/** One Git write at a time per workspace, so two saves never fight over the index lock. */
function serial<A>(root: string, work: () => Promise<A>): Promise<A> {
  const next = (chains.get(root) ?? Promise.resolve()).then(work, work);
  chains.set(
    root,
    next.catch(() => undefined),
  );
  return next;
}

const baselineCount = async (git: Git, root: string, rel: string) => {
  const log = await git(["log", "--format=%H", `--grep=^${BASELINE_TRAILER}$`, "--", rel], root);
  return log.code === 0 && log.out ? log.out.split("\n").length : 0;
};

async function messageFor(git: Git, root: string, change: Change): Promise<Array<string>> {
  if (change.what === "deal")
    return ["-m", `Content(${who(change.actor)}): new deal ${change.deal}`];
  if (change.what === "proposal") {
    const verb = change.outcome === "proposed" ? "proposed" : "dismissed proposed";
    return ["-m", `Content(${who(change.actor)}): ${verb} deal ${change.deal}`];
  }
  const ref = `${change.deal}/${change.file}`;
  if (change.what === "video") return ["-m", `Content(${who(change.actor)}): new video ${ref}`];
  if (change.what === "stage")
    return ["-m", `Content(${who(change.actor)}): ${ref} to ${change.to}`];
  if (change.actor.kind === "member") return ["-m", `Script(${change.actor.name}): ${ref}`];
  const version = (await baselineCount(git, root, videoRel(change.deal, change.file))) + 1;
  return ["-m", `Script(agent): ${ref} v${version}`, "-m", BASELINE_TRAILER];
}

/**
 * Commits the named file, or files, and only those: other staged or changed files stay as they
 * are. Hooks run as usual. A failure keeps the saved file and says why it is not in the history yet.
 */
export function recordChange(
  root: string,
  paths: string | ReadonlyArray<string>,
  change: Change,
  git: Git = realGit,
): Promise<Recorded> {
  const rels = typeof paths === "string" ? [paths] : paths;
  return serial(root, async () => {
    const inside = await git(["rev-parse", "--is-inside-work-tree"], root);
    if (inside.code !== 0) return { committed: false, detail: "The workspace is not a Git repo." };
    const add = await git(["add", "--", ...rels], root);
    if (add.code !== 0) return { committed: false, detail: add.out };
    const message = await messageFor(git, root, change);
    const identity = await identityArgs(git, root);
    const commit = await git([...identity, "commit", "-q", ...message, "--", ...rels], root);
    return commit.code === 0
      ? { committed: true, detail: "" }
      : { committed: false, detail: commit.out };
  });
}

export interface ScriptHistory {
  /** The script in the latest agent draft, the "before" side. Null before the first draft. */
  readonly baseline: string | null;
  readonly baselineCommit: string | null;
}

/** The latest agent baseline of one video. The lens shows it beside the script as it is now. */
export async function scriptHistory(
  root: string,
  deal: string,
  file: string,
  git: Git = realGit,
): Promise<ScriptHistory> {
  const rel = videoRel(deal, file);
  const log = await git(
    ["log", "-1", "--format=%H", `--grep=^${BASELINE_TRAILER}$`, "--", rel],
    root,
  );
  if (log.code !== 0 || !/^[0-9a-f]{40}$/.test(log.out))
    return { baseline: null, baselineCommit: null };
  const show = await git(["show", `${log.out}:./${rel}`], root);
  const parsed = show.code === 0 ? parseFile(show.out) : null;
  return {
    baseline: parsed ? (sections(parsed.body).get("script") ?? "") : null,
    baselineCommit: log.out,
  };
}

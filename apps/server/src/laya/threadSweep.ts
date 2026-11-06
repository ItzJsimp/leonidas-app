// @effect-diagnostics nodeBuiltinImport:off globalDate:off - runs the user's local Python to score thread tails with Laya.
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";

import { layaPaths, probeLaya } from "./layaSetup.ts";

export type SweepVerdict = "done" | "unfinished" | "abstain";

export interface ThreadTail {
  readonly lastUser: string;
  readonly lastAssistant: string;
  /** How the thread ended: a reply, a tool call, a tool result, or a user message with no reply. */
  readonly endedOn: "assistant_text" | "tool_use" | "tool_result" | "user" | "empty";
}

export interface SweepResult {
  readonly verdict: SweepVerdict;
  readonly source: "rule" | "laya";
  readonly reason: string;
}

/** Scores for one tail: [finished, waiting]. A null means the model gave no answer. */
export type LayaScores = readonly [number | null, number | null];
export type LayaScorer = (
  tails: ReadonlyArray<ThreadTail>,
) => Promise<ReadonlyArray<LayaScores> | null>;

// Yes at 0.65 or more, no at 0.35 or less; between the two the model abstains (same band as the Laya MCP server).
const YES_AT = 0.65;
const NO_AT = 0.35;
const USER_CLIP = 300;
const REPLY_CLIP = 700; // Laya reads at most 256 tokens per pass
const RULE_WINDOW = 1500;
const SHORT_ANSWER = 60;
const LAYA_TIMEOUT_MS = 120_000;
const Q_FINISHED = "Is the work requested in this conversation finished, with nothing left to do?";
const Q_WAITING =
  "Is the assistant waiting for the user to answer a question or approve something?";

// The reply standard ends finished chats with a Session Complete block or a handoff prompt, and
// waiting chats with an A) option, a Recommended line, Quick Replies or a usage-limit message.
const DONE_RULE =
  /Session Complete|You can close it now|close this chat|Resume prompt|Resume from|fresh chat|new chat/i;
const WAIT_RULE = /session limit|\*\*A\)|Recommended:|Quick Replies|Wins when/i;

const rule = (verdict: SweepVerdict, reason: string): SweepResult => ({
  verdict,
  source: "rule",
  reason,
});

/** Exact text rules. A null answer means the rules cannot decide. In doubt, never Done. */
export function classifyByRules(tail: ThreadTail): SweepResult | null {
  if (tail.endedOn === "tool_use" || tail.endedOn === "tool_result" || tail.endedOn === "user") {
    return rule("unfinished", `ended on ${tail.endedOn}`);
  }
  const reply = tail.lastAssistant.trim();
  if (reply === "") return rule("abstain", "no reply yet");
  if (reply.endsWith("?")) return rule("unfinished", "ends with a question");
  const end = reply.slice(-RULE_WINDOW);
  const waiting = WAIT_RULE.test(end);
  if (DONE_RULE.test(end) && !waiting) return rule("done", "session-complete block");
  if (reply.length < SHORT_ANSWER && !reply.includes("?") && !waiting) {
    return rule("done", "short answer");
  }
  return waiting ? rule("unfinished", "waiting for a decision or limit") : null;
}

export function verdictFromScores([finished, waiting]: LayaScores): SweepResult {
  if (finished === null || waiting === null) {
    return { verdict: "abstain", source: "laya", reason: "no model answer" };
  }
  const reason = `finished ${finished.toFixed(2)}, waiting ${waiting.toFixed(2)}`;
  if (waiting >= YES_AT || finished <= NO_AT)
    return { verdict: "unfinished", source: "laya", reason };
  if (finished >= YES_AT && waiting <= NO_AT) return { verdict: "done", source: "laya", reason };
  return { verdict: "abstain", source: "laya", reason };
}

// Reads [{state, questions}] on stdin and prints [[score, score], ...]. One process keeps the model loaded.
const LAYA_SCRIPT = [
  "import sys,json",
  "sys.path.insert(0,sys.argv[1])",
  "import engine",
  "jobs=json.load(sys.stdin)",
  "print(json.dumps([[engine.decide('noul',q,state=j['state']).get('noul') for q in j['questions']] for j in jobs]))",
].join(";");

/** Scores tails with the installed Laya engine. Returns null when Laya or Python is not usable. */
export const scoreWithLaya: LayaScorer = async (tails) => {
  const paths = layaPaths();
  const [command, ...prefix] = (await probeLaya()).python ?? [];
  if (!command) return null;
  const jobs = tails.map((tail) => ({
    state: {
      request: tail.lastUser.slice(0, USER_CLIP),
      last_reply: tail.lastAssistant.slice(-REPLY_CLIP),
    },
    questions: [Q_FINISHED, Q_WAITING],
  }));
  const output = await new Promise<string | null>((resolve) => {
    const child = NodeChildProcess.execFile(
      command,
      [...prefix, "-c", LAYA_SCRIPT, NodePath.resolve(paths.pack)],
      {
        timeout: LAYA_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 4_000_000,
        env: { ...process.env, LAYA_MODEL_DIR: paths.model },
      },
      (error, stdout) => resolve(error ? null : stdout),
    );
    child.stdin?.end(JSON.stringify(jobs));
  });
  if (output === null) return null;
  try {
    const parsed = JSON.parse(output) as ReadonlyArray<LayaScores>;
    return Array.isArray(parsed) && parsed.length === tails.length ? parsed : null;
  } catch {
    return null;
  }
};

export interface SweepOutcome {
  readonly results: ReadonlyArray<SweepResult>;
  /** False when Laya could not run, so only the rules decided. */
  readonly layaAvailable: boolean;
}

/** Rules first, then one Laya batch for the tails the rules leave open. */
export async function sweepTails(
  tails: ReadonlyArray<ThreadTail>,
  score: LayaScorer = scoreWithLaya,
): Promise<SweepOutcome> {
  const results: Array<SweepResult | null> = tails.map(classifyByRules);
  const open = tails.flatMap((tail, index) => (results[index] === null ? [index] : []));
  let layaAvailable = true;
  if (open.length > 0) {
    const scores = await score(open.map((index) => tails[index]!));
    layaAvailable = scores !== null;
    open.forEach((index, position) => {
      const pair = scores?.[position];
      results[index] = pair
        ? verdictFromScores(pair)
        : { verdict: "abstain", source: "laya", reason: "Laya is not available" };
    });
  }
  return { results: results.map((result) => result!), layaAvailable };
}

export interface SweepCandidate {
  readonly archived: boolean;
  /** Settled threads already left the active list (time-based settlement), so the sweep skips them. */
  readonly settled: boolean;
  readonly pinned: boolean;
  readonly running: boolean;
  readonly updatedAtMs: number;
}

/** Unarchived, unsettled, unpinned, not running, and idle at least `idleMs`. */
export const isSweepEligible = (thread: SweepCandidate, nowMs: number, idleMs: number): boolean =>
  !thread.archived &&
  !thread.settled &&
  !thread.pinned &&
  !thread.running &&
  nowMs - thread.updatedAtMs >= idleMs;

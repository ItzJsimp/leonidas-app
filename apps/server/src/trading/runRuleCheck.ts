// @effect-diagnostics nodeBuiltinImport:off - the rule check runs in its own Node process.
import * as NodeChildProcess from "node:child_process";

/** One export file for the check module. A name with "funded" marks a Funded account. */
export interface CheckFile {
  readonly name: string;
  readonly text: string;
}

export interface CheckGrade {
  readonly setup: string;
  readonly ruleBreaks: readonly string[];
}

/** `waiting` holds the trade ids of days with no market bars. Ids are the export's own trade Ids. */
export type CheckOutcome =
  | {
      readonly status: "done";
      readonly grades: ReadonlyMap<string, CheckGrade>;
      readonly waiting: ReadonlySet<string>;
    }
  | { readonly status: "failed"; readonly reason: string };

const TIMEOUT_MS = 10_000;
const MAX_OUTPUT = 1_000_000;

// Runs inside the child. Pack contract: one self-contained file (it cannot import other files)
// with `loadTrades(files)` and `reviewDay(trades, bars)` for one day, plus optional
// `etParts(t).date` to split days. Prints one JSON line.
/** Exported so a test can start it without the permission model. */
export const RULE_CHECK_RUNNER = `
// Fail closed: without the permission model the module would have full file access.
const permission = process.permission;
if (!permission || permission.has("fs.write") || permission.has("fs.read") || permission.has("child") || permission.has("worker")) process.exit(3);
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
// The module is the exact bytes the trader allowed. A data: module cannot import a file by a
// relative path, and the child has no file access, so nothing else can change what runs.
const pack = await import("data:text/javascript;base64," + input.source);
const trades = pack.loadTrades(input.files);
const days = new Map();
for (const trade of trades) {
  const day = typeof pack.etParts === "function" ? pack.etParts(trade.tIn).date : "all";
  if (!days.has(day)) days.set(day, []);
  days.get(day).push(trade);
}
process.stdout.write(JSON.stringify([...days.values()].map((list) => {
  const result = pack.reviewDay(list, input.bars);
  return {
    status: result.status,
    ids: list.map((trade) => String(trade.id)),
    rows: (result.rows ?? []).map((row) => ({ id: String(row.id), setup: row.setup, breaks: row.breaks })),
  };
})));
`;

const isText = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "" && v.length <= 500;

/** Strict read of the child's answer. Anything unexpected is a failed check, never a grade. */
export function readCheckOutput(stdout: string): CheckOutcome {
  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    return { status: "failed", reason: "the check module printed no valid answer" };
  }
  if (!Array.isArray(data)) return { status: "failed", reason: "the answer is not a list" };
  const grades = new Map<string, CheckGrade>();
  const waiting = new Set<string>();
  for (const result of data as unknown[]) {
    const { status, ids, rows } = (result ?? {}) as {
      status?: unknown;
      ids?: unknown;
      rows?: unknown;
    };
    if (status !== "ok" && status !== "waiting" && status !== "no-trades") {
      return { status: "failed", reason: "an unknown check status" };
    }
    if (!Array.isArray(rows) || !Array.isArray(ids) || !ids.every(isText)) {
      return { status: "failed", reason: "rows or ids are not a list" };
    }
    if (status === "waiting") for (const id of ids) waiting.add(id);
    for (const row of rows as unknown[]) {
      const { id, setup, breaks } = (row ?? {}) as {
        id?: unknown;
        setup?: unknown;
        breaks?: unknown;
      };
      if (!isText(id) || !isText(setup) || !Array.isArray(breaks) || breaks.length > 50) {
        return { status: "failed", reason: "a row has a bad shape" };
      }
      if (!breaks.every(isText)) return { status: "failed", reason: "a rule break is not text" };
      grades.set(id, { setup, ruleBreaks: breaks });
    }
  }
  return { status: "done", grades, waiting };
}

/** Only what the child needs. NODE_OPTIONS and the rest of the server environment stay out. */
function childEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = "1";
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  return env;
}

/**
 * Runs the pack's check module in a child Node process with the permission model on: it cannot
 * read or write any file, start processes or start workers. It can still use the network. `source`
 * is the exact bytes the trader allowed (by SHA-256), so a file that changes later cannot run. A
 * crash, a timeout or a bad answer gives `failed`, so the import still completes.
 */
export function runRuleCheck(input: {
  readonly source: Uint8Array;
  readonly files: readonly CheckFile[];
  readonly bars: readonly (readonly number[])[];
  readonly timeoutMs?: number;
}): Promise<CheckOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: CheckOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    let child: NodeChildProcess.ChildProcess;
    try {
      child = NodeChildProcess.spawn(
        process.execPath,
        ["--permission", "--input-type=module", "-e", RULE_CHECK_RUNNER],
        // `timeout` makes Node stop only this child, by its own handle.
        {
          env: childEnv(),
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
          timeout: input.timeoutMs ?? TIMEOUT_MS,
        },
      );
    } catch {
      resolve({ status: "failed", reason: "the check could not start" });
      return;
    }
    let stdout = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > MAX_OUTPUT) {
        child.kill();
        finish({ status: "failed", reason: "the check printed too much" });
      }
    });
    child.stderr?.resume();
    child.on("error", () => finish({ status: "failed", reason: "the check could not start" }));
    child.on("close", (code, signal) =>
      finish(
        code === 0
          ? readCheckOutput(stdout)
          : {
              status: "failed",
              reason: signal ? "the check took too long" : `the check stopped with code ${code}`,
            },
      ),
    );
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(
      JSON.stringify({
        files: input.files,
        bars: input.bars,
        source: Buffer.from(input.source).toString("base64"),
      }),
    );
  });
}

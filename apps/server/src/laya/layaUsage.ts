// @effect-diagnostics nodeBuiltinImport:off globalDate:off - reads one per-user log file on request; a missing or torn file gives an empty result, never an error.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import type { LayaUsage } from "@t3tools/contracts";

const DAYS = 7;
const MAX_LOG_BYTES = 6_000_000;

const dayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Turns usage log lines into the monitor numbers. Bad lines are skipped, so a torn write never breaks the card. */
export function summarizeUsage(
  lines: ReadonlyArray<string>,
  now: number,
  health: Pick<LayaUsage, "modelPresent" | "packPresent">,
): LayaUsage {
  const days = new Map<string, number>();
  for (let i = DAYS - 1; i >= 0; i -= 1) days.set(dayKey(now - i * 86_400_000), 0);
  const jobs = new Map<
    string,
    { count: number; blocked: number; asked: number; flagged: number }
  >();
  let total = 0;
  for (const line of lines) {
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row === null || typeof row !== "object") continue;
    const { ts, job, verdict } = row as Record<string, unknown>;
    if (typeof ts !== "number" || typeof job !== "string" || typeof verdict !== "string") continue;
    total += 1;
    const key = dayKey(ts * 1000);
    if (days.has(key)) days.set(key, (days.get(key) ?? 0) + 1);
    const entry = jobs.get(job) ?? { count: 0, blocked: 0, asked: 0, flagged: 0 };
    entry.count += 1;
    if (verdict === "BLOCK") entry.blocked += 1;
    if (verdict === "CONFIRM") entry.asked += 1;
    if (verdict === "FLAGGED") entry.flagged += 1;
    jobs.set(job, entry);
  }
  return {
    status: health.modelPresent && health.packPresent ? "ready" : "missing",
    ...health,
    total,
    days: [...days].map(([date, count]) => ({ date, count })),
    jobs: [...jobs].map(([job, v]) => ({ job, ...v })).toSorted((a, b) => b.count - a.count),
  };
}

const exists = (path: string): Promise<boolean> =>
  NodeFSP.stat(path).then(
    () => true,
    () => false,
  );

/** Where `usage.py` moves the log at 5 MB: same folder, `<name>.old.jsonl`. */
export const rotatedLogPath = (logPath: string): string => {
  const { dir, name } = NodePath.parse(logPath);
  return NodePath.join(dir, `${name}.old.jsonl`);
};

const readLogText = async (path: string): Promise<string> => {
  try {
    return (await NodeFSP.stat(path)).size <= MAX_LOG_BYTES
      ? await NodeFSP.readFile(path, "utf8")
      : "";
  } catch {
    return "";
  }
};

/** Lines of the rotated log, then the live log, so a rotation does not reset the monitor. */
export async function readLogLines(logPath: string): Promise<ReadonlyArray<string>> {
  const [rotated, live] = await Promise.all([
    readLogText(rotatedLogPath(logPath)),
    readLogText(logPath),
  ]);
  return `${rotated}\n${live}`.split("\n").filter(Boolean);
}

/** Reads the per-user Laya usage log. A missing log or pack gives an empty, valid result. */
export async function readLayaUsage(): Promise<LayaUsage> {
  const home = NodeOS.homedir();
  const logPath =
    process.env.LAYA_USAGE_LOG ?? NodePath.join(home, ".leonidas", "laya", "usage.jsonl");
  const [modelPresent, packPresent] = await Promise.all([
    exists(NodePath.join(home, ".leonidas", "models", "laya", "laya_int8.onnx")),
    exists(NodePath.join(home, ".leonidas", "laya", "bash_gate_hook.py")),
  ]);
  return summarizeUsage(await readLogLines(logPath), Date.now(), {
    modelPresent,
    packPresent,
  });
}

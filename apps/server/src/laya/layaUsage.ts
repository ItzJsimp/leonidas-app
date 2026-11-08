// @effect-diagnostics nodeBuiltinImport:off globalDate:off - reads one per-user log file on request; a missing or torn file gives an empty result, never an error.
import * as NodeFSP from "node:fs/promises";
import * as NodeChildProcess from "node:child_process";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import type { LayaUsage } from "@t3tools/contracts";
import { layaPaths, probeLaya, sha256OfFile } from "./layaSetup.ts";

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
  health: Pick<LayaUsage, "modelPresent" | "packPresent"> &
    Partial<Pick<LayaUsage, "engineStatus" | "modelHash" | "probeMs" | "jevState" | "gameMode">>,
): LayaUsage {
  const days = new Map<string, number>();
  for (let i = DAYS - 1; i >= 0; i -= 1) days.set(dayKey(now - i * 86_400_000), 0);
  const jobs = new Map<
    string,
    { count: number; blocked: number; asked: number; flagged: number }
  >();
  let total = 0;
  const tiers = { rules: 0, model: 0, jev: 0 };
  for (const line of lines) {
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row === null || typeof row !== "object") continue;
    const { ts, job, verdict, tier } = row as Record<string, unknown>;
    if (
      typeof ts !== "number" ||
      !Number.isFinite(ts) ||
      typeof job !== "string" ||
      typeof verdict !== "string"
    )
      continue;
    total += 1;
    if (tier === "rules" || tier === "model" || tier === "jev") tiers[tier] += 1;
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
    status: (
      health.engineStatus
        ? health.engineStatus === "ready"
        : health.modelPresent && health.packPresent
    )
      ? "ready"
      : "missing",
    modelPresent: health.modelPresent,
    packPresent: health.packPresent,
    engineStatus:
      health.engineStatus ??
      (health.modelPresent && health.packPresent ? "ready" : "missing-model"),
    modelHash: health.modelHash ?? null,
    probeMs: health.probeMs ?? null,
    jevState: health.jevState ?? "off",
    gameMode: health.gameMode ?? false,
    tiers,
    total,
    days: [...days].map(([date, count]) => ({ date, count })),
    jobs: [...jobs].map(([job, v]) => ({ job, ...v })).toSorted((a, b) => b.count - a.count),
  };
}

type LocalHealth = Pick<
  LayaUsage,
  "modelPresent" | "packPresent" | "engineStatus" | "modelHash" | "probeMs"
>;
const HEALTH_TTL_MS = 5 * 60_000;
let healthCache: { key: string; at: number; result: Promise<LocalHealth> } | undefined;

async function localHealth(home: string, gameMode: boolean): Promise<LocalHealth> {
  const paths = layaPaths(home);
  const model = NodePath.join(paths.model, "laya_int8.onnx");
  const engine = NodePath.join(paths.pack, "engine.py");
  const files = [model, NodePath.join(paths.model, "tokenizer.json"), engine];
  const stats = await Promise.all(files.map((file) => NodeFSP.stat(file).catch(() => null)));
  const key = `${home}|${gameMode}|${stats.map((stat) => (stat ? `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}` : "missing")).join("|")}`;
  if (healthCache?.key === key && Date.now() - healthCache.at < HEALTH_TTL_MS)
    return healthCache.result;
  const result = (async (): Promise<LocalHealth> => {
    const health: LocalHealth = {
      modelPresent: Boolean(stats[0]?.isFile()),
      packPresent: Boolean(stats[2]?.isFile()),
      engineStatus: "missing-pack",
      modelHash: stats[0]?.isFile()
        ? (await sha256OfFile(model).catch(() => "")).slice(0, 8) || null
        : null,
      probeMs: null,
    };
    if (!health.packPresent) return health;
    if (!health.modelPresent || !stats[1]?.isFile())
      return { ...health, engineStatus: "missing-model" };
    if (gameMode) return { ...health, engineStatus: "paused" };
    const probe = await probeLaya();
    const [python, ...prefix] = probe.python ?? [];
    if (!python || probe.missingPackages.length)
      return { ...health, engineStatus: "missing-runtime" };
    return new Promise((resolve) => {
      NodeChildProcess.execFile(
        python,
        [...prefix, engine, "health"],
        {
          timeout: 120_000,
          windowsHide: true,
          maxBuffer: 16_384,
          env: { ...process.env, LAYA_MODEL_DIR: paths.model },
        },
        (error, stdout) => {
          if (error) return resolve({ ...health, engineStatus: "error" });
          try {
            const data: unknown = JSON.parse(stdout);
            const row =
              data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
            const status = row.status;
            resolve({
              ...health,
              engineStatus:
                status === "ready" || status === "missing-model" || status === "missing-runtime"
                  ? status
                  : "error",
              probeMs:
                typeof row.probe_ms === "number" &&
                Number.isFinite(row.probe_ms) &&
                row.probe_ms >= 0
                  ? row.probe_ms
                  : null,
            });
          } catch {
            resolve({ ...health, engineStatus: "error" });
          }
        },
      );
    });
  })();
  healthCache = { key, at: Date.now(), result };
  return result;
}

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
export async function readLayaUsage(home = NodeOS.homedir()): Promise<LayaUsage> {
  const logPath =
    process.env.LAYA_USAGE_LOG ?? NodePath.join(home, ".leonidas", "laya", "usage.jsonl");
  const gameMode = process.env.AIOS_GAME_MODE === "1";
  const health = await localHealth(home, gameMode);
  return summarizeUsage(await readLogLines(logPath), Date.now(), {
    ...health,
    gameMode,
    jevState: process.env.OPENROUTER_API_KEY ? "ready" : "off",
  });
}

// @effect-diagnostics nodeBuiltinImport:off - isolated user folders exercise the usage reader.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";

import * as NodeFS from "node:fs";
import { readLayaUsage, readLogLines, rotatedLogPath, summarizeUsage } from "./layaUsage.ts";

const processMock = vi.hoisted(() => ({ output: '{"status":"ready","probe_ms":12.5}', calls: 0 }));
vi.mock("node:child_process", () => ({
  execFile: (
    _command: string,
    args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    if (args.includes("health")) processMock.calls += 1;
    callback(null, args.includes("health") ? processMock.output : "3.11\n\n", "");
  },
}));

const folders: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  processMock.output = '{"status":"ready","probe_ms":12.5}';
  for (const folder of folders.splice(0))
    await NodeFSP.rm(folder, { recursive: true, force: true });
});

const userHome = async () => {
  const home = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "laya health é "));
  folders.push(home);
  vi.stubEnv("LAYA_USAGE_LOG", NodePath.join(home, "usage.jsonl"));
  return home;
};

const installedHome = async () => {
  const home = await userHome();
  const pack = NodePath.join(home, ".leonidas", "laya");
  const model = NodePath.join(home, ".leonidas", "models", "laya");
  await NodeFSP.mkdir(pack, { recursive: true });
  await NodeFSP.mkdir(model, { recursive: true });
  await NodeFSP.writeFile(NodePath.join(pack, "engine.py"), "");
  await NodeFSP.writeFile(NodePath.join(model, "laya_int8.onnx"), "abc");
  await NodeFSP.writeFile(NodePath.join(model, "tokenizer.json"), "{}");
  return home;
};

describe("readLayaUsage", () => {
  it("returns valid health and zero tiers when the pack and log are missing", async () => {
    const result = await readLayaUsage(await userHome());
    expect(result).toMatchObject({
      engineStatus: "missing-pack",
      modelHash: null,
      probeMs: null,
      total: 0,
      tiers: { rules: 0, model: 0, jev: 0 },
    });
  });

  it("shares the local probe across requests and reads live flags without exposing the key", async () => {
    const home = await installedHome();
    await NodeFSP.writeFile(
      NodePath.join(home, "usage.jsonl"),
      `${row("screen", "CLEAN")}\r\n{torn`,
    );
    const before = processMock.calls;
    const [a, b] = await Promise.all([readLayaUsage(home), readLayaUsage(home)]);
    expect(a).toMatchObject({
      engineStatus: "ready",
      modelHash: "ba7816bf",
      probeMs: 12.5,
      total: 1,
    });
    expect(b).toEqual(a);
    expect(processMock.calls - before).toBe(1);
    vi.stubEnv("OPENROUTER_API_KEY", "private-test-value");
    vi.stubEnv("AIOS_GAME_MODE", "1");
    const paused = await readLayaUsage(home);
    expect(paused).toMatchObject({ gameMode: true, engineStatus: "paused", jevState: "ready" });
    expect(JSON.stringify(paused)).not.toContain("private-test-value");
    expect(processMock.calls - before).toBe(1);
  });

  it("refreshes after five minutes and after a model replacement", async () => {
    const home = await installedHome();
    const now = NOW;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const before = processMock.calls;
    await readLayaUsage(home);
    await readLayaUsage(home);
    expect(processMock.calls - before).toBe(1);
    clock.mockReturnValue(now + 300_001);
    await readLayaUsage(home);
    expect(processMock.calls - before).toBe(2);
    await NodeFSP.writeFile(
      NodePath.join(home, ".leonidas", "models", "laya", "laya_int8.onnx"),
      "different model",
    );
    expect((await readLayaUsage(home)).modelHash).not.toBe("ba7816bf");
    expect(processMock.calls - before).toBe(3);
  });

  it.each(["not json", "null", '{"status":"error","error":"private-test-value"}'])(
    "returns safe error health for invalid probe output: %s",
    async (output) => {
      processMock.output = output;
      const result = await readLayaUsage(await installedHome());
      expect(result).toMatchObject({ status: "missing", engineStatus: "error", probeMs: null });
      expect(JSON.stringify(result)).not.toContain("private-test-value");
    },
  );
});

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const row = (job: string, verdict: string, ageDays = 0) =>
  JSON.stringify({
    ts: (NOW - ageDays * 86_400_000) / 1000,
    job,
    verdict,
    tier: "rules",
    project: "p",
  });
const ready = { modelPresent: true, packPresent: true };

describe("rotated log", () => {
  it("names the rotated file like usage.py does", () => {
    expect(rotatedLogPath(NodePath.join("a", "usage.jsonl"))).toBe(
      NodePath.join("a", "usage.old.jsonl"),
    );
    expect(rotatedLogPath(NodePath.join("a", "x.log"))).toBe(NodePath.join("a", "x.old.jsonl"));
  });

  it("reads the rotated log before the live log and tolerates either missing", async () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "laya-usage-"));
    try {
      const live = NodePath.join(dir, "usage.jsonl");
      expect(await readLogLines(live)).toEqual([]);
      NodeFS.writeFileSync(live, `${row("screen", "CLEAN")}\n`);
      expect(await readLogLines(live)).toHaveLength(1);
      NodeFS.writeFileSync(rotatedLogPath(live), `${row("bash_gate", "BLOCK", 5)}\n`);
      const lines = await readLogLines(live);
      expect(lines).toHaveLength(2);
      expect(summarizeUsage(lines, NOW, ready).total).toBe(2);
    } finally {
      NodeFS.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("summarizeUsage", () => {
  it("returns a valid empty result for no lines", () => {
    const s = summarizeUsage([], NOW, ready);
    expect(s.total).toBe(0);
    expect(s.jobs).toEqual([]);
    expect(s.days).toHaveLength(7);
    expect(s.status).toBe("ready");
  });

  it("counts blocks, asks and flags per job and sorts by volume", () => {
    const s = summarizeUsage(
      [
        row("bash_gate", "BLOCK"),
        row("bash_gate", "CONFIRM"),
        row("bash_gate", "ALLOW"),
        row("screen", "FLAGGED"),
      ],
      NOW,
      ready,
    );
    expect(s.jobs[0]).toEqual({ job: "bash_gate", count: 3, blocked: 1, asked: 1, flagged: 0 });
    expect(s.jobs[1]).toMatchObject({ job: "screen", flagged: 1 });
  });

  it("counts each tier and returns only safe health fields", () => {
    const health = {
      ...ready,
      engineStatus: "ready" as const,
      modelHash: "ba7816bf",
      probeMs: 12.5,
      jevState: "paused" as const,
      gameMode: true,
      key: "private-test-value",
    };
    const s = summarizeUsage(
      [
        row("screen", "CLEAN"),
        JSON.stringify({ ts: NOW / 1000, job: "screen", verdict: "FLAGGED", tier: "model" }),
        JSON.stringify({ ts: NOW / 1000, job: "route", verdict: "ALLOW", tier: "jev" }),
        "{torn",
      ],
      NOW,
      health,
    );
    expect(s.tiers).toEqual({ rules: 1, model: 1, jev: 1 });
    expect(s).toMatchObject({
      engineStatus: "ready",
      modelHash: "ba7816bf",
      probeMs: 12.5,
      jevState: "paused",
      gameMode: true,
    });
    expect(JSON.stringify(s)).not.toContain("private-test-value");
  });

  it("skips torn and malformed lines", () => {
    const s = summarizeUsage(
      ['{"ts":1', "not json", "null", '{"ts":"x"}', row("screen", "CLEAN")],
      NOW,
      ready,
    );
    expect(s.total).toBe(1);
  });

  it("buckets by day and keeps only 7 days in the day list", () => {
    const s = summarizeUsage(
      [row("screen", "CLEAN", 0), row("screen", "CLEAN", 2), row("screen", "CLEAN", 30)],
      NOW,
      ready,
    );
    expect(s.total).toBe(3);
    expect(s.days.reduce((n, d) => n + d.count, 0)).toBe(2);
  });

  it("reports missing when the pack or model is absent", () => {
    expect(summarizeUsage([], NOW, { modelPresent: false, packPresent: true }).status).toBe(
      "missing",
    );
    expect(summarizeUsage([], NOW, { modelPresent: true, packPresent: false }).status).toBe(
      "missing",
    );
  });
});

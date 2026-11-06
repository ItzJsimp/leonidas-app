import { assert, describe, it } from "@effect/vitest";

import {
  appendHistoryRow,
  appMemoryScript,
  evaluateBudgets,
  HISTORY_HEADER,
  parseBenchOutput,
  removeQuietly,
  renderReport,
  type BenchmarkSample,
} from "./release-benchmark.ts";

const goodSample: BenchmarkSample = {
  version: "1.0.100",
  date: "2026-10-17",
  engineIdleMb: 13.7,
  engineColdStartMs: 145.3,
  hotkeyMs: 0.1,
  appIdleMb: 320,
  appColdStartMs: 1500,
  installerBytes: 151313681,
};

describe("parseBenchOutput", () => {
  it("reads the JSON line the scribe-bench binary prints", () => {
    const stdout = [
      '{"audio":"null","hotkeyMsAll":[0.1,0.1],"hotkeyMsWorst":0.1,"idleRamMb":13.7,"ramAfterRoundsMb":14.2,"coldStartMs":145.3}',
      "PASS hotkey_to_recording_ms 0.1 (budget 50)",
    ].join("\n");
    assert.deepStrictEqual(parseBenchOutput(stdout), {
      hotkeyMs: 0.1,
      engineIdleMb: 13.7,
      engineColdStartMs: 145.3,
    });
  });

  it("throws when no JSON line is present", () => {
    assert.throws(() => parseBenchOutput("PASS only"), /scribe-bench/);
  });
});

describe("evaluateBudgets", () => {
  it("passes a sample inside every budget and keeps the Tauri gate closed", () => {
    const result = evaluateBudgets(goodSample, { enforceApp: false });
    assert.isFalse(result.failed);
    assert.isFalse(result.tauriGateTripped);
    assert.isTrue(result.checks.every((check) => check.ok));
  });

  it("fails the build when an engine budget is missed", () => {
    for (const patch of [{ engineIdleMb: 31 }, { engineColdStartMs: 2001 }, { hotkeyMs: 51 }]) {
      const result = evaluateBudgets({ ...goodSample, ...patch }, { enforceApp: false });
      assert.isTrue(result.failed, JSON.stringify(patch));
    }
  });

  it("warns, without failing, when an app budget is missed on the first release", () => {
    const result = evaluateBudgets({ ...goodSample, appIdleMb: 501 }, { enforceApp: false });
    assert.isFalse(result.failed);
    assert.isTrue(result.tauriGateTripped);
    const appCheck = result.checks.find((check) => check.name === "app idle RAM")!;
    assert.isFalse(appCheck.ok);
    assert.isFalse(appCheck.gated);
  });

  it("fails the build on an app budget once the app budgets are enforced", () => {
    const idle = evaluateBudgets({ ...goodSample, appIdleMb: 501 }, { enforceApp: true });
    assert.isTrue(idle.failed);
    const cold = evaluateBudgets({ ...goodSample, appColdStartMs: 2001 }, { enforceApp: true });
    assert.isTrue(cold.failed);
  });
});

describe("history and report", () => {
  it("appends one dated row per release and replaces a rerun of the same version", () => {
    const first = appendHistoryRow("", goodSample);
    assert.isTrue(first.startsWith(HISTORY_HEADER));
    assert.equal(first.trim().split("\n").length, 2);

    const second = appendHistoryRow(first, { ...goodSample, version: "1.0.101" });
    assert.equal(second.trim().split("\n").length, 3);

    const rerun = appendHistoryRow(second, { ...goodSample, version: "1.0.101", appIdleMb: 340 });
    const rows = rerun.trim().split("\n");
    assert.equal(rows.length, 3);
    assert.include(rows[2]!, "340");
  });

  it("reports the Tauri gate as unknown when the app was not measured", () => {
    const sample = { ...goodSample, appIdleMb: Number.NaN, appColdStartMs: Number.NaN };
    const result = evaluateBudgets(sample, { enforceApp: false });
    assert.isFalse(result.tauriGateTripped);
    assert.isFalse(result.appMeasured);
    assert.isFalse(result.failed);
    const report = renderReport(appendHistoryRow("", sample), result);
    assert.include(report, "Tauri gate: UNKNOWN");
    assert.isTrue(evaluateBudgets(sample, { enforceApp: true }).failed);
  });

  it("states whether the Tauri gate is tripped and lists the trend", () => {
    const history = appendHistoryRow(appendHistoryRow("", goodSample), {
      ...goodSample,
      version: "1.0.101",
    });
    const closed = renderReport(history, evaluateBudgets(goodSample, { enforceApp: false }));
    assert.include(closed, "Tauri gate: NOT tripped");
    assert.include(closed, "1.0.100");
    assert.include(closed, "1.0.101");

    const tripped = renderReport(
      history,
      evaluateBudgets({ ...goodSample, appIdleMb: 600 }, { enforceApp: false }),
    );
    assert.include(tripped, "Tauri gate: TRIPPED");
  });
});

describe("appMemoryScript", () => {
  it("sums private memory over the app processes, not the working set that counts shared pages twice", () => {
    const script = appMemoryScript("C:\Apps\Leonidas.exe");
    assert.include(script, "PrivateMemorySize64");
    assert.notInclude(script, "WorkingSet64");
    assert.include(script, "C:\Apps\Leonidas.exe");
  });

  it("escapes a single quote in the path", () => {
    assert.include(appMemoryScript("C:\it's\app.exe"), "it''s");
  });
});

describe("removeQuietly", () => {
  it("swallows a locked-folder error so the measurement before it survives", () => {
    const locked = () => {
      throw new Error("EPERM, Permission denied");
    };
    assert.doesNotThrow(() => removeQuietly("C:/tmp/leonidas-bench-x", locked));
  });
});

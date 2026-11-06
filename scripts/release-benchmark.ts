#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalDate:off globalTimers:off - Standalone CI CLI that spawns the built app and reads wall-clock time; it runs outside any Effect runtime.
// Per-release benchmark and budget gate (ADR-0074). Measures the Scribe engine
// with scribe-bench, then installs-by-extraction and launches the built app to
// measure full-app idle RAM (private memory) and cold start. Engine budgets fail the build. App
// budgets fail it only with --enforce-app; before that they warn and the report
// says whether the Tauri gate (an app budget busted) is tripped.
//
//   node scripts/release-benchmark.ts --version 1.0.100 --installer release/Leonidas-1.0.100-x64.exe \
//     --engine-dir services/scribe-engine/target/x86_64-pc-windows-msvc/release \
//     [--history benchmark-history.csv] [--out-dir release] [--idle-seconds 30] [--enforce-app]
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const BUDGETS = {
  hotkeyMs: 50,
  engineIdleMb: 30,
  engineColdStartMs: 2000,
  appIdleMb: 500,
  appColdStartMs: 2000,
} as const;

export interface BenchmarkSample {
  readonly version: string;
  readonly date: string;
  readonly engineIdleMb: number;
  readonly engineColdStartMs: number;
  readonly hotkeyMs: number;
  readonly appIdleMb: number;
  readonly appColdStartMs: number;
  readonly installerBytes: number;
}

export interface BudgetCheck {
  readonly name: string;
  readonly value: number;
  readonly budget: number;
  readonly unit: string;
  readonly ok: boolean;
  readonly gated: boolean;
}

export interface BudgetResult {
  readonly checks: ReadonlyArray<BudgetCheck>;
  readonly failed: boolean;
  readonly tauriGateTripped: boolean;
  readonly appMeasured: boolean;
}

export function parseBenchOutput(stdout: string): {
  readonly hotkeyMs: number;
  readonly engineIdleMb: number;
  readonly engineColdStartMs: number;
} {
  const line = stdout.split("\n").find((entry) => entry.trim().startsWith("{"));
  if (line === undefined) throw new Error("scribe-bench printed no JSON result line");
  const parsed = JSON.parse(line) as {
    hotkeyMsWorst: number;
    idleRamMb: number;
    coldStartMs: number;
  };
  return {
    hotkeyMs: parsed.hotkeyMsWorst,
    engineIdleMb: parsed.idleRamMb,
    engineColdStartMs: parsed.coldStartMs,
  };
}

export function evaluateBudgets(
  sample: BenchmarkSample,
  options: { readonly enforceApp: boolean },
): BudgetResult {
  // A NaN (not measured) never satisfies `<=`, so it counts as a miss.
  const make = (
    name: string,
    value: number,
    budget: number,
    unit: string,
    gated: boolean,
  ): BudgetCheck => ({ name, value, budget, unit, ok: value <= budget, gated });
  const checks = [
    make("hotkey to recording", sample.hotkeyMs, BUDGETS.hotkeyMs, "ms", true),
    make("engine idle RAM", sample.engineIdleMb, BUDGETS.engineIdleMb, "MB", true),
    make("engine cold start", sample.engineColdStartMs, BUDGETS.engineColdStartMs, "ms", true),
    make("app idle RAM", sample.appIdleMb, BUDGETS.appIdleMb, "MB", options.enforceApp),
    make("app cold start", sample.appColdStartMs, BUDGETS.appColdStartMs, "ms", options.enforceApp),
  ];
  return {
    checks,
    failed: checks.some((check) => check.gated && !check.ok),
    // Only a measured miss trips the gate; an unmeasured app leaves it unknown.
    tauriGateTripped: checks.some(
      (check) => check.name.startsWith("app ") && Number.isFinite(check.value) && !check.ok,
    ),
    appMeasured: Number.isFinite(sample.appIdleMb) && Number.isFinite(sample.appColdStartMs),
  };
}

export const HISTORY_HEADER =
  "version,date,engineIdleMb,engineColdStartMs,hotkeyMs,appIdleMb,appColdStartMs,installerBytes";

const toRow = (sample: BenchmarkSample): string =>
  [
    sample.version,
    sample.date,
    sample.engineIdleMb,
    sample.engineColdStartMs,
    sample.hotkeyMs,
    sample.appIdleMb,
    sample.appColdStartMs,
    sample.installerBytes,
  ].join(",");

export function appendHistoryRow(history: string, sample: BenchmarkSample): string {
  const rows = history
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== HISTORY_HEADER)
    // One row per release: a rerun of the same version replaces its row.
    .filter((line) => !line.startsWith(`${sample.version},`));
  return `${[HISTORY_HEADER, ...rows, toRow(sample)].join("\n")}\n`;
}

const shown = (value: number, unit: string): string =>
  Number.isFinite(value) ? `${value} ${unit}` : "not measured";

export function renderReport(history: string, result: BudgetResult): string {
  const lines = history
    .split("\n")
    .filter((line) => line.length > 0 && line !== HISTORY_HEADER)
    .slice(-10);
  const out = [
    "# Release benchmark",
    "",
    result.tauriGateTripped
      ? "Tauri gate: TRIPPED (an app budget is busted; reopen the shell decision)."
      : result.appMeasured
        ? "Tauri gate: NOT tripped."
        : "Tauri gate: UNKNOWN (the app was not measured this release).",
    "",
    "| Check | Value | Budget | Result | Gate |",
    "| --- | --- | --- | --- | --- |",
    ...result.checks.map(
      (check) =>
        `| ${check.name} | ${shown(check.value, check.unit)} | ${check.budget} ${check.unit} | ${
          check.ok ? "pass" : check.gated ? "FAIL" : "warn"
        } | ${check.gated ? "fails the build" : "warn only"} |`,
    ),
    "",
    "## Trend (last 10 releases)",
    "",
    `| ${HISTORY_HEADER.split(",").join(" | ")} |`,
    `| ${HISTORY_HEADER.split(",")
      .map(() => "---")
      .join(" | ")} |`,
    ...lines.map((line) => `| ${line.split(",").join(" | ")} |`),
    "",
  ];
  return out.join("\n");
}

function sevenZip(): string {
  if (process.env.SEVENZIP) return process.env.SEVENZIP;
  const local = "C:/Program Files/7-Zip/7z.exe";
  return existsSync(local) ? local : "7z";
}

function powershell(script: string): string {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      encoding: "utf8",
    },
  );
  return result.stdout.trim();
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

const psPath = (path: string) => path.replaceAll("/", "\\").replaceAll("'", "''");

/**
 * PowerShell that prints the summed private bytes of every process of the app. Private memory is
 * what the app owns; the working set counts shared pages once per process (761.3 MB on the first
 * proof), so it overstates the cost against the budget.
 */
export const appMemoryScript = (appExe: string): string =>
  `(Get-Process | Where-Object { $_.Path -eq '${psPath(appExe)}' } | Measure-Object PrivateMemorySize64 -Sum).Sum`;

/** Deletes a folder and never throws: cleanup must not replace a measurement already taken. */
export function removeQuietly(path: string, remove: typeof rmSync = rmSync): void {
  try {
    remove(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch (error) {
    console.log(`::warning::Could not remove ${path}: ${String(error)}`);
  }
}

async function measureApp(appExe: string, idleSeconds: number) {
  const home = mkdtempSync(join(tmpdir(), "leonidas-bench-"));
  const exeForPs = psPath(appExe);
  const started = Date.now();
  // The app allows one instance per user, so this cannot run beside a running
  // Leonidas on the same Windows account (a CI runner has none). The app
  // rejects --user-data-dir, so T3CODE_HOME alone isolates its state.
  const child = spawn(appExe, [], {
    env: { ...process.env, T3CODE_HOME: home },
    stdio: "ignore",
  });
  let coldStartMs = Number.NaN;
  try {
    while (Date.now() - started < 60_000 && child.exitCode === null) {
      const handle = powershell(
        `(Get-Process | Where-Object { $_.Path -eq '${exeForPs}' -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1).Id`,
      );
      if (handle.length > 0) {
        coldStartMs = Date.now() - started;
        break;
      }
      await sleep(100);
    }
    await sleep(idleSeconds * 1000);
    const bytes = Number(powershell(appMemoryScript(appExe)));
    // No running process sums to 0 or NaN: report not measured, never 0 MB.
    const idleMb = bytes > 0 ? Math.round((bytes / 1024 / 1024) * 10) / 10 : Number.NaN;
    return { coldStartMs, idleMb };
  } finally {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    // Windows keeps the files locked for a moment after the kill. A throw here would discard the
    // numbers above (release 0.100.0 reported "not measured" for this reason).
    removeQuietly(home);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const version = flag("--version");
  const installer = flag("--installer");
  const engineDir = flag("--engine-dir");
  if (!version || !installer || !engineDir) {
    throw new Error("usage: release-benchmark.ts --version V --installer EXE --engine-dir DIR");
  }
  const outDir = resolve(flag("--out-dir") ?? "release");
  const historyPath = flag("--history");
  const idleSeconds = Number(flag("--idle-seconds") ?? "30");

  const bench = spawnSync(
    join(engineDir, "scribe-bench.exe"),
    ["--engine", join(engineDir, "scribe-engine.exe"), "--null-audio"],
    { encoding: "utf8" },
  );
  const engine = parseBenchOutput(bench.stdout ?? "");

  const extracted = mkdtempSync(join(tmpdir(), "leonidas-bench-install-"));
  let app: { coldStartMs: number; idleMb: number };
  try {
    const outer = join(extracted, "outer");
    spawnSync(sevenZip(), ["x", "-y", `-o${outer}`, installer], { stdio: "ignore" });
    const appDir = join(extracted, "app");
    spawnSync(sevenZip(), ["x", "-y", `-o${appDir}`, join(outer, "$PLUGINSDIR", "app-64.7z")], {
      stdio: "ignore",
    });
    const appExe = join(appDir, "Leonidas.exe");
    if (!existsSync(appExe)) throw new Error(`installer did not contain ${appExe}`);
    app = await measureApp(appExe, idleSeconds);
  } catch (error) {
    // An app that cannot be measured is a warning, not a stopped release, unless enforced.
    console.log(`::warning::App measurement failed: ${String(error)}`);
    app = { coldStartMs: Number.NaN, idleMb: Number.NaN };
  } finally {
    removeQuietly(extracted);
  }

  const sample: BenchmarkSample = {
    version,
    date: new Date().toISOString().slice(0, 10),
    ...engine,
    appIdleMb: app.idleMb,
    appColdStartMs: app.coldStartMs,
    installerBytes: readFileSync(installer).length,
  };
  const result = evaluateBudgets(sample, { enforceApp: argv.includes("--enforce-app") });
  const history = appendHistoryRow(
    historyPath && existsSync(historyPath) ? readFileSync(historyPath, "utf8") : "",
    sample,
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "benchmark-history.csv"), history);
  const report = renderReport(history, result);
  writeFileSync(join(outDir, "benchmark-report.md"), report);
  console.log(report);
  for (const check of result.checks) {
    if (!check.ok && !check.gated) {
      console.log(
        `::warning::${check.name} ${shown(check.value, check.unit)} over ${check.budget}`,
      );
    }
  }
  if (result.failed) {
    console.error("A gated budget was missed.");
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}

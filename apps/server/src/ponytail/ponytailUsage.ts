// @effect-diagnostics nodeBuiltinImport:off globalDate:off - reads local files on request; a missing or torn file gives an empty result, never an error.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import type { PonytailUsage } from "@t3tools/contracts";

const RECENT = 10;
const MAX_LEDGER_BYTES = 4_000_000;
/** Published Ponytail 5 benchmark (39 tasks, 5 runs each, Opus 5.5): the share of the no-skill baseline that remains. */
const BENCHMARK = { cost: 0.74, time: 0.59, output: 0.55 } as const;
/** The ledger names a task by its first prompt line; a skill run opens with this preamble. */
const SKILL_PREAMBLE = "The request mentions skills";

/** Splits CSV text into rows, honoring quoted fields that hold commas, quotes or newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1) rows.push(row);
  }
  return rows;
}

const num = (value: string | undefined): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Turns ledger rows (header first) into the card numbers. Short or bad rows are skipped. */
export function summarizePonytail(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  accounts: PonytailUsage["accounts"],
): PonytailUsage {
  const header = rows[0] ?? [];
  const col = (name: string) => header.indexOf(name);
  const idx = {
    started: col("started"),
    project: col("project"),
    name: col("name"),
    cost: col("cost_usd"),
    turns: col("turns"),
    minutes: col("agent_minutes"),
    out: col("tokens_output"),
    level: col("level"),
    tests: col("tests"),
    reused: col("reused"),
    created: col("new"),
    callers: col("callers_open"),
  };
  const tasks = (idx.cost < 0 ? [] : rows.slice(1)).map((r) => {
    const reused = num(r[idx.reused]);
    const created = num(r[idx.created]);
    return {
      started: r[idx.started] ?? "",
      project: r[idx.project] ?? "",
      skillRun: (r[idx.name] ?? "").startsWith(SKILL_PREAMBLE),
      // A task counts as code work when the agent wrote or reused code in it.
      code: reused + created > 0,
      reused,
      created,
      callersOpen: num(r[idx.callers]),
      testsRan: idx.tests >= 0 && (r[idx.tests] ?? "") !== "" && r[idx.tests] !== "not run",
      name: (r[idx.name] ?? "").slice(0, 80),
      costUsd: num(r[idx.cost]),
      turns: num(r[idx.turns]),
      agentMinutes: num(r[idx.minutes]),
      outputTokens: num(r[idx.out]),
      level: r[idx.level] ?? "",
    };
  });
  type Task = (typeof tasks)[number];
  const sum = (list: ReadonlyArray<Task>, pick: (t: Task) => number) =>
    list.reduce((total, t) => total + pick(t), 0);
  const codeTasks = tasks.filter((t) => t.code);
  const code = {
    tasks: codeTasks.length,
    costUsd: sum(codeTasks, (t) => t.costUsd),
    agentMinutes: sum(codeTasks, (t) => t.agentMinutes),
    outputTokens: sum(codeTasks, (t) => t.outputTokens),
    reused: sum(codeTasks, (t) => t.reused),
    created: sum(codeTasks, (t) => t.created),
    callersOpen: sum(codeTasks, (t) => t.callersOpen),
    testsRan: idx.tests < 0 ? null : codeTasks.filter((t) => t.testsRan).length,
  };
  // What the benchmark share would imply for the code work: used / kept gives the baseline size.
  const saved = (used: number, kept: number) => (used * (1 - kept)) / kept;
  return {
    status: tasks.length > 0 || accounts.some((a) => a.plugin !== "off") ? "ready" : "missing",
    accounts: [...accounts],
    since:
      tasks
        .map((t) => t.started.slice(0, 10))
        .filter(Boolean)
        .toSorted()[0] ?? "",
    providersBefore: [],
    providers: [],
    tasks: tasks.length,
    costUsd: sum(tasks, (t) => t.costUsd),
    agentMinutes: sum(tasks, (t) => t.agentMinutes),
    outputTokens: sum(tasks, (t) => t.outputTokens),
    code,
    projected: {
      costUsd: saved(code.costUsd, BENCHMARK.cost),
      agentMinutes: saved(code.agentMinutes, BENCHMARK.time),
      outputTokens: Math.round(saved(code.outputTokens, BENCHMARK.output)),
    },
    recent: tasks
      .toSorted((a, b) => b.started.localeCompare(a.started))
      .slice(0, RECENT)
      .map(
        ({
          skillRun,
          testsRan: _ran,
          code: _code,
          reused: _r,
          created: _c,
          callersOpen: _o,
          ...t
        }) => ({
          ...t,
          name: skillRun ? "Skill run" : t.name,
        }),
      ),
  };
}

/** The plugin writes its ledger under XDG_CONFIG_HOME, else ~/.config, on every platform. */
const ponytailLedgerDir = (env: NodeJS.ProcessEnv = process.env): string =>
  NodePath.join(
    env.XDG_CONFIG_HOME || NodePath.join(NodeOS.homedir(), ".config"),
    "ponytail",
    "band",
  );

export async function readPonytailUsage(
  accounts: PonytailUsage["accounts"],
): Promise<PonytailUsage> {
  const dir = ponytailLedgerDir();
  const rows: string[][] = [];
  for (const file of (await NodeFSP.readdir(dir).catch(() => [])).filter((f) =>
    f.endsWith(".csv"),
  )) {
    try {
      const text = await NodeFSP.readFile(NodePath.join(dir, file), "utf8");
      if (text.length > MAX_LEDGER_BYTES) continue;
      const parsed = parseCsv(text);
      rows.push(...(rows.length === 0 ? parsed : parsed.slice(1)));
    } catch {
      // A torn file is skipped.
    }
  }
  return summarizePonytail(rows, accounts);
}

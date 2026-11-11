import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as SubagentRuns from "./SubagentRuns.ts";
import { runCostUsd, runStatus, summaryLine } from "./subagentRuns.logic.ts";

const addThread = (sql: SqlClient.SqlClient, id: string, title: string, payload = "{}") =>
  sql`
    INSERT INTO orchestration_v2_projection_threads
      (thread_id, project_id, title, default_provider, runtime_mode, interaction_mode, created_at, updated_at, payload_json)
    VALUES (${id}, 'p1', ${title}, 'claude', 'full-access', 'default', '2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z', ${payload})
  `;

const addRun = (
  sql: SqlClient.SqlClient,
  input: {
    readonly id: string;
    readonly thread: string;
    readonly child?: string;
    readonly origin: string;
    readonly status: string;
    readonly startedAt?: string;
    readonly completedAt?: string;
    readonly payload: Record<string, unknown>;
  },
) =>
  sql`
    INSERT INTO orchestration_v2_projection_subagents
      (subagent_id, thread_id, parent_node_id, provider, driver, provider_instance_id, child_thread_id, origin, status, started_at, completed_at, updated_at, payload_json)
    VALUES (${input.id}, ${input.thread}, 'node', 'claude', 'claude', 'claude', ${input.child ?? null}, ${input.origin}, ${input.status},
      ${input.startedAt ?? null}, ${input.completedAt ?? null}, ${input.completedAt ?? input.startedAt ?? "2026-10-20T00:00:00.000Z"}, ${JSON.stringify(input.payload)})
  `;

it.effect("lists live and finished runs from the stored status, with kind and result", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* addThread(sql, "parent", "Main chat");
    yield* addThread(sql, "kid", "Child", JSON.stringify({ persona: { name: "Reviewer" } }));
    yield* addRun(sql, {
      id: "live",
      thread: "parent",
      child: "kid",
      origin: "app_owned",
      status: "running",
      startedAt: "2026-10-20T10:00:00.000Z",
      payload: { title: "Check the tests", prompt: "Run all tests", model: "claude-haiku-5-5" },
    });
    yield* addRun(sql, {
      id: "native",
      thread: "parent",
      origin: "provider_native",
      status: "completed",
      startedAt: "2026-10-20T09:00:00.000Z",
      completedAt: "2026-10-20T09:00:30.000Z",
      payload: { title: null, prompt: "Find the bug\nin detail", result: "It was a typo." },
    });
    yield* addRun(sql, {
      id: "stopped",
      thread: "parent",
      origin: "app_owned",
      status: "interrupted",
      startedAt: "2026-10-20T08:00:00.000Z",
      completedAt: "2026-10-20T08:05:00.000Z",
      payload: { prompt: "Long task", result: "partial" },
    });
    const service = yield* SubagentRuns.SubagentRuns;

    const running = yield* service.list({ scope: "running" });
    expect(running.runningCount).toBe(1);
    expect(running.runs.map((run) => [run.id, run.kind, run.status, run.canStop])).toEqual([
      ["live", "persona", "running", true],
    ]);
    expect(running.runs[0]?.model).toBe("claude-haiku-5-5");

    const history = yield* service.list({ scope: "history" });
    expect(history.runs.map((run) => [run.id, run.kind, run.status, run.durationMs])).toEqual([
      ["native", "native", "done", 30_000],
      ["stopped", "delegated", "cancelled", 300_000],
    ]);
    expect(history.runs[0]?.result).toBe("It was a typo.");
    expect(history.runs[0]?.summary).toBe("Find the bug");
    // A cancelled run shows no result, even when the stored row holds partial text.
    expect(history.runs[1]?.result).toBeNull();

    const failedOnly = yield* service.list({ scope: "history", status: "failed" });
    expect(failedOnly.runs).toEqual([]);
    const searched = yield* service.list({ scope: "history", query: "main chat" });
    expect(searched.runs).toHaveLength(2);
    const paged = yield* service.list({ scope: "history", limit: 1 });
    expect(paged.nextCursor).not.toBeNull();
    const second = yield* service.list({ scope: "history", limit: 1, cursor: paged.nextCursor! });
    expect(second.runs.map((run) => run.id)).toEqual(["stopped"]);
    expect(second.nextCursor).toBeNull();
  }).pipe(Effect.provide(Layer.provideMerge(SubagentRuns.layer, SqlitePersistence.layerMemory))),
);

it("maps stored statuses to page statuses", () => {
  expect(
    ["pending", "waiting", "completed", "idle", "interrupted", "failed"].map(runStatus),
  ).toEqual(["running", "waiting", "done", "done", "cancelled", "failed"]);
  expect(summaryLine("  ", "")).toBe("Subagent task");
});

const HAIKU_RATE = {
  inputCostPerToken: 1e-6,
  outputCostPerToken: 5e-6,
  cacheReadCostPerToken: 1e-7,
  cacheCreationCostPerToken: 1.25e-6,
  fast: null,
  ultrafast: null,
};
const rateFor = (model: string) => Effect.succeed(model === "claude-haiku-5-5" ? HAIKU_RATE : null);

const addTurn = (
  sql: SqlClient.SqlClient,
  input: { readonly id: string; readonly thread: string; readonly ordinal: number },
  usage: Record<string, unknown>,
) =>
  sql`
    INSERT INTO orchestration_v2_projection_provider_turns
      (provider_turn_id, thread_id, provider_thread_id, node_id, ordinal, status, payload_json)
    VALUES (${input.id}, ${input.thread}, 'pt', 'node', ${input.ordinal}, 'completed',
      ${JSON.stringify({ turnTokenUsage: { usageScope: "main_agent", hasSubagents: false, ...usage } })})
  `;

it("prices a run from reported tokens, and counts cached input once", () => {
  // Input includes the cached and cache-creation tokens, so 1000 of the 1500 are plain input.
  const tokens = { input: 1500, cachedInput: 400, cacheCreation: 100, output: 300 };
  expect(runCostUsd(tokens, HAIKU_RATE)).toBeCloseTo(0.002665, 9);
  expect(runCostUsd(tokens, null)).toBeNull();
  expect(
    runCostUsd({ input: null, cachedInput: null, cacheCreation: null, output: null }, HAIKU_RATE),
  ).toBeNull();
});

it.effect("returns account, cost and the parent run for a run started by another run", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* addThread(sql, "main", "Main chat");
    yield* addThread(sql, "lead-chat", "Lead chat");
    yield* addThread(sql, "scout-chat", "Scout chat");
    const done = {
      origin: "app_owned",
      status: "completed",
      startedAt: "2026-10-20T10:00:00.000Z",
      completedAt: "2026-10-20T10:01:00.000Z",
    };
    yield* addRun(sql, {
      ...done,
      id: "lead",
      thread: "main",
      child: "lead-chat",
      payload: { prompt: "Plan", model: "claude-haiku-5-5" },
    });
    yield* addRun(sql, {
      ...done,
      id: "scout",
      thread: "lead-chat",
      child: "scout-chat",
      payload: { prompt: "Look", model: "claude-haiku-5-5" },
    });
    yield* addTurn(
      sql,
      { id: "t1", thread: "scout-chat", ordinal: 1 },
      {
        usageStatus: "complete",
        inputTokens: 1000,
        cachedInputTokens: 400,
        cacheCreationTokens: 100,
        outputTokens: 200,
      },
    );
    yield* addTurn(
      sql,
      { id: "t2", thread: "scout-chat", ordinal: 2 },
      { usageStatus: "complete", inputTokens: 500, outputTokens: 100 },
    );
    const service = yield* SubagentRuns.SubagentRuns;

    const { runs } = yield* service.list({ scope: "history" }, rateFor);
    const byId = new Map(runs.map((run) => [run.id, run]));
    expect(byId.get("scout")?.parentRunId).toBe("lead");
    expect(byId.get("lead")?.parentRunId).toBeNull();
    expect(byId.get("scout")?.account).toBe("claude");
    expect(byId.get("scout")?.costUsd).toBeCloseTo(0.002665, 9);
    // The lead's own chat reported no tokens, so its cost is unknown, never zero.
    expect(byId.get("lead")?.costUsd).toBeNull();

    // Without a price lookup the cost stays unknown.
    const unpriced = yield* service.list({ scope: "history" });
    expect(unpriced.runs.map((run) => run.costUsd)).toEqual([null, null]);
  }).pipe(Effect.provide(Layer.provideMerge(SubagentRuns.layer, SqlitePersistence.layerMemory))),
);

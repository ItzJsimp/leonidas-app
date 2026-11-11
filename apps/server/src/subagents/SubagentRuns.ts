/**
 * Subagent runs for the Subagents page. One read of the stored subagent rows, joined to the
 * parent chat. The status comes from the run events the app stored, never from a guess.
 */
import {
  SubagentRunsError,
  type SubagentRun,
  type SubagentRunKind,
  type SubagentRunStatus,
  type SubagentRunsInput,
  type SubagentRunsResult,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import {
  ACTIVE_RAW_STATUSES,
  cutText,
  decodeRunCursor,
  durationMs,
  encodeRunCursor,
  rawStatusesFor,
  runCostUsd,
  runKind,
  runStatus,
  summaryLine,
} from "./subagentRuns.logic.ts";
import type { TokenRates } from "../usage/usagePricing.ts";

const DEFAULT_LIMIT = 100;
const TASK_CAP = 2_000;
const RESULT_CAP = 8_000;

interface RunRow {
  readonly subagent_id: string;
  readonly thread_id: string;
  readonly parent_title: string | null;
  readonly child_thread_id: string | null;
  readonly origin: string;
  readonly status: string;
  readonly driver: string | null;
  readonly provider_instance_id: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly updated_at: string;
  readonly sort_key: string;
  readonly title: string | null;
  readonly prompt: string | null;
  readonly prompt_length: number | null;
  readonly result: string | null;
  readonly result_length: number | null;
  readonly model: string | null;
  readonly has_workflow: number;
  readonly child_persona: string | null;
}

interface UsageRow {
  readonly thread_id: string;
  readonly input_tokens: number | null;
  readonly cached_tokens: number | null;
  readonly cache_creation_tokens: number | null;
  readonly output_tokens: number | null;
}

/** Looks up the price of one model. Null means the price table does not know it. */
export type RateFor = (model: string) => Effect.Effect<TokenRates | null>;

export class SubagentRuns extends Context.Service<
  SubagentRuns,
  {
    /** `rateFor` prices each run's chat. Without it every cost is null. */
    readonly list: (
      input: SubagentRunsInput,
      rateFor?: RateFor,
    ) => Effect.Effect<SubagentRunsResult, SubagentRunsError>;
  }
>()("t3/subagents/SubagentRuns") {}

const toSubagentRun = (
  row: RunRow,
  parentRunId: string | null,
  costUsd: number | null,
): SubagentRun => {
  const status: SubagentRunStatus = runStatus(row.status);
  const kind: SubagentRunKind = runKind({
    origin: row.origin,
    hasWorkflow: row.has_workflow === 1,
    persona: row.child_persona,
  });
  const prompt = row.prompt ?? "";
  const result = status === "done" && row.result ? row.result : null;
  const promptCut = cutText(prompt, TASK_CAP, row.prompt_length ?? prompt.length);
  const resultCut =
    result === null ? null : cutText(result, RESULT_CAP, row.result_length ?? result.length);
  const endedAt = status === "running" || status === "waiting" ? null : row.completed_at;
  return {
    id: row.subagent_id,
    kind,
    parent: {
      id: ThreadId.make(row.thread_id),
      title: row.parent_title ?? "Untitled chat",
    },
    childThreadId: row.child_thread_id === null ? null : ThreadId.make(row.child_thread_id),
    provider: row.driver ?? row.provider_instance_id ?? "unknown",
    account: row.provider_instance_id,
    model: row.model,
    parentRunId,
    costUsd,
    status,
    rawStatus: row.status,
    startedAt: row.started_at,
    endedAt,
    durationMs: durationMs(row.started_at, endedAt),
    summary: summaryLine(row.title, prompt),
    task: promptCut.text,
    result: resultCut?.text ?? null,
    truncated: promptCut.truncated || (resultCut?.truncated ?? false),
    // The app owns the child chat of its own subagents, so Stop reaches them. A provider-native
    // subagent runs inside the provider's turn and has no cancel path here.
    canStop:
      row.origin === "app_owned" &&
      row.child_thread_id !== null &&
      (status === "running" || status === "waiting"),
  };
};

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const list = (input: SubagentRunsInput, rateFor?: RateFor) =>
    Effect.gen(function* () {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const active = input.scope === "running";
      const statuses = input.status === undefined ? null : rawStatusesFor(input.status);
      const cursor = decodeRunCursor(input.cursor);
      const query = input.query?.trim().toLowerCase() ?? "";
      const sortExpr = active
        ? sql`COALESCE(s.started_at, s.updated_at)`
        : sql`COALESCE(s.completed_at, s.updated_at)`;
      const rows = yield* sql<RunRow>`
        SELECT
          s.subagent_id,
          s.thread_id,
          parent.title AS parent_title,
          s.child_thread_id,
          s.origin,
          s.status,
          COALESCE(s.driver, json_extract(s.payload_json, '$.driver')) AS driver,
          s.provider_instance_id,
          s.started_at,
          s.completed_at,
          s.updated_at,
          ${sortExpr} AS sort_key,
          json_extract(s.payload_json, '$.title') AS title,
          substr(json_extract(s.payload_json, '$.prompt'), 1, ${TASK_CAP}) AS prompt,
          length(json_extract(s.payload_json, '$.prompt')) AS prompt_length,
          substr(json_extract(s.payload_json, '$.result'), 1, ${RESULT_CAP}) AS result,
          length(json_extract(s.payload_json, '$.result')) AS result_length,
          COALESCE(
            json_extract(s.payload_json, '$.model'),
            json_extract(s.payload_json, '$.modelSelection.model'),
            json_extract(child.payload_json, '$.modelSelection.model')
          ) AS model,
          json_type(s.payload_json, '$.workflow') IS NOT NULL AS has_workflow,
          json_extract(child.payload_json, '$.persona.name') AS child_persona
        FROM orchestration_v2_projection_subagents AS s
        JOIN orchestration_v2_projection_threads AS parent
          ON parent.thread_id = s.thread_id AND parent.deleted_at IS NULL
        LEFT JOIN orchestration_v2_projection_threads AS child
          ON child.thread_id = s.child_thread_id
        WHERE ${active ? sql`s.status IN ${sql.in(ACTIVE_RAW_STATUSES)}` : sql`s.status NOT IN ${sql.in(ACTIVE_RAW_STATUSES)}`}
          ${statuses === null ? sql`` : sql`AND s.status IN ${sql.in(statuses)}`}
          ${input.parentThreadId === undefined ? sql`` : sql`AND s.thread_id = ${input.parentThreadId}`}
          ${
            query === ""
              ? sql``
              : sql`AND instr(lower(COALESCE(json_extract(s.payload_json, '$.title'), '') || ' ' || COALESCE(substr(json_extract(s.payload_json, '$.prompt'), 1, 500), '') || ' ' || COALESCE(parent.title, '')), ${query}) > 0`
          }
          ${
            cursor === null
              ? sql``
              : sql`AND (${sortExpr} < ${cursor.sortKey}
                  OR (${sortExpr} = ${cursor.sortKey} AND s.subagent_id > ${cursor.id}))`
          }
        ORDER BY sort_key DESC, s.subagent_id ASC
        LIMIT ${limit + 1}
      `;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const counted = yield* sql<{ readonly count: number }>`
        SELECT COUNT(*) AS count
        FROM orchestration_v2_projection_subagents AS s
        JOIN orchestration_v2_projection_threads AS parent
          ON parent.thread_id = s.thread_id AND parent.deleted_at IS NULL
        WHERE s.status IN ${sql.in(ACTIVE_RAW_STATUSES)}
      `;
      // Cost and parent links come from two small reads of this page only, never a table scan.
      const childIds = page.flatMap((row) =>
        row.child_thread_id === null ? [] : [row.child_thread_id],
      );
      const usageRows =
        childIds.length === 0
          ? []
          : yield* sql<UsageRow>`
              SELECT thread_id,
                SUM(json_extract(payload_json, '$.turnTokenUsage.inputTokens')) AS input_tokens,
                SUM(json_extract(payload_json, '$.turnTokenUsage.cachedInputTokens')) AS cached_tokens,
                SUM(json_extract(payload_json, '$.turnTokenUsage.cacheCreationTokens')) AS cache_creation_tokens,
                SUM(json_extract(payload_json, '$.turnTokenUsage.outputTokens')) AS output_tokens
              FROM orchestration_v2_projection_provider_turns
              WHERE thread_id IN ${sql.in(childIds)}
              GROUP BY thread_id
            `;
      const parentThreadIds = [...new Set(page.map((row) => row.thread_id))];
      const parentRows =
        parentThreadIds.length === 0
          ? []
          : yield* sql<{ readonly child_thread_id: string; readonly subagent_id: string }>`
              SELECT child_thread_id, MIN(subagent_id) AS subagent_id
              FROM orchestration_v2_projection_subagents
              WHERE child_thread_id IN ${sql.in(parentThreadIds)}
              GROUP BY child_thread_id
            `;
      const usageByThread = new Map(usageRows.map((row) => [row.thread_id, row]));
      const parentRunByThread = new Map(
        parentRows.map((row) => [row.child_thread_id, row.subagent_id]),
      );
      const models = [...new Set(page.flatMap((row) => (row.model === null ? [] : [row.model])))];
      const rates = new Map<string, TokenRates | null>(
        rateFor === undefined
          ? []
          : yield* Effect.forEach(models, (model) =>
              rateFor(model).pipe(Effect.map((rate) => [model, rate] as const)),
            ),
      );
      const costOf = (row: RunRow): number | null => {
        const usage =
          row.child_thread_id === null ? undefined : usageByThread.get(row.child_thread_id);
        if (usage === undefined) return null;
        return runCostUsd(
          {
            input: usage.input_tokens,
            cachedInput: usage.cached_tokens,
            cacheCreation: usage.cache_creation_tokens,
            output: usage.output_tokens,
          },
          row.model === null ? null : (rates.get(row.model) ?? null),
        );
      };
      return {
        runs: page.map((row) =>
          toSubagentRun(row, parentRunByThread.get(row.thread_id) ?? null, costOf(row)),
        ),
        nextCursor:
          rows.length > limit && last !== undefined
            ? encodeRunCursor(last.sort_key, last.subagent_id)
            : null,
        runningCount: counted[0]?.count ?? 0,
      } satisfies SubagentRunsResult;
    }).pipe(Effect.mapError((cause) => new SubagentRunsError({ cause })));

  return SubagentRuns.of({ list });
});

export const layer = Layer.effect(SubagentRuns, make);

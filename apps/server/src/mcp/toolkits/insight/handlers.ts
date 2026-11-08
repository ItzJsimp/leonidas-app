import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as Clock from "effect/Clock";
import { readMemory, searchMemory } from "#server/aiosMemory/aiosMemory.ts";
import * as Calendar from "#server/calendar/Calendar.ts";
import { calendarEvents, rangeError } from "#server/calendar/calendarEvents.ts";
import { compareTurns, turnPerf } from "#server/diagnostics/turnPerfReport.ts";
import * as LocalModelsService from "#server/localModels/LocalModelsService.ts";
import { pickModel } from "#server/localModels/modelPick.ts";
import * as ScribeEngine from "#server/scribe/ScribeEngine.ts";
import { makeScribeStats } from "#server/scribe/scribeStats.ts";
import { scribeSummary } from "#server/scribe/scribeSummary.ts";
import * as HardwareWatch from "#server/hardwareWatch/HardwareWatch.ts";
import { hardwareStatus } from "#server/hardwareWatch/hardwareStatus.ts";
import * as ProjectService from "#server/project/ProjectService.ts";
import * as ReviewService from "#server/review/ReviewService.ts";
import {
  capPreview,
  cut,
  isRepositoryPath,
  MAX_FILE_CHARS,
} from "#server/review/reviewDiffLimits.ts";
import * as ProviderRegistry from "#server/provider/ProviderRegistry.ts";
import { readReleaseStatus } from "#server/releaseStatus/releaseStatus.ts";
import * as Settings from "#server/serverSettings.ts";
import { usageStatus } from "#server/usage/usageStatus.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { readThread, unavailable } from "../../threadAccess.ts";
import { workspaceRoot } from "../marketing/handlers.ts";
import { InsightToolkit } from "./tools.ts";

const failed = (message: string) =>
  new OrchestratorMcpFailure({ code: "orchestration_error", message });

// One stats object per engine, so repeated calls share its short history cache.
const statsByEngine = new WeakMap<object, ReturnType<typeof makeScribeStats>>();
const statsFor = (engine: ScribeEngine.ScribeEngine["Service"]) => {
  const known = statsByEngine.get(engine);
  if (known !== undefined) return known;
  const made = makeScribeStats(engine);
  statsByEngine.set(engine, made);
  return made;
};

export const layer = McpToolAccess.toLayer(InsightToolkit, {
  leo_aios_memory_search: McpToolAccess.reads(({ query, limit }) =>
    Effect.gen(function* () {
      const root = yield* workspaceRoot;
      const hits = yield* Effect.try({
        try: () => searchMemory(root, query, limit ?? 5),
        catch: (error) => failed(`Memory search failed: ${String(error)}`),
      });
      return { indexBuilt: hits !== null, hits: hits ?? [] };
    }),
  ),
  leo_aios_memory_read: McpToolAccess.reads(({ path }) =>
    Effect.gen(function* () {
      const root = yield* workspaceRoot;
      const entry = yield* Effect.try({
        try: () => readMemory(root, path),
        catch: (error) => failed(`Memory read failed: ${String(error)}`),
      });
      if (entry === "not_built")
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message:
            "This AIOS has no memory index yet. Build it with scripts/Build-LeonidasMemoryIndex.py.",
        });
      if (entry === null)
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: `No indexed memory at ${path}. Use the exact path from leo_aios_memory_search.`,
        });
      return entry;
    }),
  ),
  leo_usage_status: McpToolAccess.reads(() =>
    Effect.gen(function* () {
      const registry = yield* ProviderRegistry.ProviderRegistry;
      const settings = yield* Settings.ServerSettingsService;
      const providers = yield* registry.getProviders;
      const { subagentQuotaBlockPercent } = yield* settings.getSettings.pipe(
        Effect.mapError((error) => failed(`Settings unavailable: ${error.message}`)),
      );
      const nowMs = yield* Clock.currentTimeMillis;
      return {
        nearLimitPercent: subagentQuotaBlockPercent,
        accounts: usageStatus(providers, nowMs, subagentQuotaBlockPercent),
      };
    }),
  ),
  leo_hardware_status: McpToolAccess.reads(() =>
    Effect.gen(function* () {
      const watch = yield* HardwareWatch.HardwareWatch;
      const sample = yield* watch.latestSample;
      const { alerts } = yield* watch
        .agentContext(undefined)
        .pipe(Effect.mapError((error) => failed(`Hardware alerts unavailable: ${error.reason}`)));
      return hardwareStatus(sample, alerts);
    }),
  ),
  leo_review_diff_get: McpToolAccess.reads(
    ({ threadId, baseRef, ignoreWhitespace, file, contentsOf }) =>
      Effect.gen(function* () {
        for (const path of [file?.path, contentsOf?.path])
          if (path !== undefined && !isRepositoryPath(path))
            return yield* new OrchestratorMcpFailure({
              code: "invalid_request",
              message: `Path must stay inside the repository: ${path}`,
            });
        const {
          projection: { thread },
        } = yield* readThread(threadId);
        const projects = yield* ProjectService.ProjectService;
        const project = yield* projects
          .getById(thread.projectId)
          .pipe(Effect.mapError(unavailable));
        if (Option.isNone(project))
          return yield* new OrchestratorMcpFailure({
            code: "invalid_request",
            message: "The project was not found.",
          });
        const cwd = thread.worktreePath ?? project.value.workspaceRoot;
        const review = yield* ReviewService.ReviewService;
        const preview = yield* review
          .getDiffPreview({
            cwd,
            ...(baseRef === undefined ? {} : { baseRef }),
            ...(ignoreWhitespace === undefined ? {} : { ignoreWhitespace }),
            ...(file === undefined ? {} : { file: { ...file, previousPath: null } }),
          })
          .pipe(Effect.mapError((error) => failed(`Diff failed: ${error.message}`)));
        const capped = capPreview(preview);
        const source = preview.sources.find((entry) => entry.kind === contentsOf?.sourceKind);
        if (contentsOf === undefined || source === undefined) return capped;
        // shortcut: treats the file as changed in place. A new, deleted or renamed file may fail here.
        const both = yield* review
          .getDiffFileContents({
            cwd,
            sourceKind: contentsOf.sourceKind,
            changeType: "change",
            baseRef: source.baseRef,
            headRef: source.headRef,
            oldPath: contentsOf.path,
            newPath: contentsOf.path,
          })
          .pipe(Effect.mapError((error) => failed(`File read failed: ${error.message}`)));
        const before = cut(both.oldContents, MAX_FILE_CHARS);
        const after = cut(both.newContents, MAX_FILE_CHARS);
        return {
          ...capped,
          contents: {
            path: contentsOf.path,
            oldContents: before.text,
            newContents: after.text,
            truncated: before.truncated || after.truncated,
          },
        };
      }),
  ),
  leo_perf_turn_report: McpToolAccess.reads(({ threadId, limit }) =>
    Effect.gen(function* () {
      const { projection } = yield* readThread(threadId, [
        "runs",
        "attempts",
        "nodes",
        "providerTurns",
      ]);
      const runs = turnPerf(projection, limit ?? 5);
      return { runs, change: compareTurns(runs) };
    }),
  ),
  leo_calendar_events: McpToolAccess.reads(({ from, to }) =>
    Effect.gen(function* () {
      const problem = rangeError(from, to);
      if (problem !== null)
        return yield* new OrchestratorMcpFailure({ code: "invalid_request", message: problem });
      const calendar = yield* Calendar.Calendar;
      const { events } = yield* calendar.events({
        from: DateTime.formatIso(DateTime.makeUnsafe(Date.parse(from))),
        to: DateTime.formatIso(DateTime.makeUnsafe(Date.parse(to))),
      });
      // The server's own zone: on the user's computer this is where they live.
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return { timeZone, events: calendarEvents(events, timeZone) };
    }),
  ),
  leo_scribe_insights: McpToolAccess.reads(() =>
    Effect.gen(function* () {
      const stats = statsFor(yield* ScribeEngine.ScribeEngine);
      const [insights, goals] = yield* Effect.all([stats.getInsights({}), stats.getGoals({})]).pipe(
        Effect.mapError((error) => failed(`Scribe is not available: ${error.message}`)),
      );
      return scribeSummary(insights, goals);
    }),
  ),
  leo_local_models_advice: McpToolAccess.reads(({ size }) =>
    Effect.gen(function* () {
      const models = yield* LocalModelsService.LocalModelsService;
      const state = yield* models.subscribe.pipe(
        Stream.runHead,
        Effect.mapError((error) => failed(`Local models unavailable: ${error.reason}`)),
      );
      if (Option.isNone(state)) return yield* failed("Local models gave no state.");
      return {
        ollamaRunning: state.value.ollama.running,
        ...pickModel(state.value.rows, size ?? "medium"),
      };
    }),
  ),
  leo_release_status: McpToolAccess.reads(() => Effect.promise(() => readReleaseStatus())),
});

import { OrchestratorMcpFailure, ReleaseStatus, ThreadId } from "@t3tools/contracts";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as Calendar from "#server/calendar/Calendar.ts";
import * as ServerConfig from "#server/config.ts";
import * as HardwareWatch from "#server/hardwareWatch/HardwareWatch.ts";
import * as LocalModelsService from "#server/localModels/LocalModelsService.ts";
import * as ScribeEngine from "#server/scribe/ScribeEngine.ts";
import * as ThreadManagementService from "#server/orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "#server/project/ProjectService.ts";
import * as ProviderRegistry from "#server/provider/ProviderRegistry.ts";
import * as ReviewService from "#server/review/ReviewService.ts";
import * as Settings from "#server/serverSettings.ts";
import * as TaskBoardService from "#server/taskBoard/TaskBoardService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const shared = { failure: OrchestratorMcpFailure, failureMode: "return" as const };
const MemorySearchTool = Tool.make("leo_aios_memory_search", {
  ...shared,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ProjectService.ProjectService,
    TaskBoardService.TaskBoardService,
  ],
  description:
    "Search this AIOS memory index. Ranked hits with file path, line and snippet. Open one with `leo_aios_memory_read`.",
  parameters: Schema.Struct({
    query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500)),
    limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }))),
  }),
  success: Schema.Struct({
    indexBuilt: Schema.Boolean,
    hits: Schema.Array(
      Schema.Struct({
        path: Schema.String,
        name: Schema.String,
        description: Schema.String,
        snippet: Schema.String,
        score: Schema.Number,
        line: Schema.optional(Schema.Number),
      }),
    ),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const MemoryReadTool = Tool.make("leo_aios_memory_read", {
  ...shared,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ProjectService.ProjectService,
    TaskBoardService.TaskBoardService,
  ],
  description:
    "Read one indexed AIOS memory entry by the exact `path` from `leo_aios_memory_search`. Long text is cut and flagged.",
  parameters: Schema.Struct({ path: Schema.String.check(Schema.isMinLength(1)) }),
  success: Schema.Struct({
    path: Schema.String,
    name: Schema.String,
    description: Schema.String,
    content: Schema.String,
    truncated: Schema.Boolean,
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const UsageStatusTool = Tool.make("leo_usage_status", {
  ...shared,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ProviderRegistry.ProviderRegistry,
    Settings.ServerSettingsService,
  ],
  description:
    "Read used and remaining usage for each connected account. Check it before `leo_delegate_task`. `at_limit` and `near_limit` accounts should not take new work.",
  success: Schema.Struct({
    nearLimitPercent: Schema.Number,
    accounts: Schema.Array(
      Schema.Struct({
        providerInstanceId: Schema.String,
        account: Schema.String,
        driver: Schema.String,
        state: Schema.Literals(["ok", "near_limit", "at_limit", "no_data"]),
        highestUsedPercent: Schema.NullOr(Schema.Number),
        windows: Schema.Array(
          Schema.Struct({
            label: Schema.String,
            usedPercent: Schema.Number,
            remainingPercent: Schema.Number,
            resetsAt: Schema.optional(Schema.String),
          }),
        ),
      }),
    ),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const ReleaseStatusTool = Tool.make("leo_release_status", {
  ...shared,
  dependencies: [McpInvocationContext.McpInvocationContext],
  description:
    "Read the newest Leonidas Code release runs, newest first. The first run is the latest release. The repo is fixed.",
  success: ReleaseStatus,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const NullableNumber = Schema.NullOr(Schema.Number);
const RepoSourceKind = Schema.Literals(["working-tree", "branch-range"]);

const HardwareStatusTool = Tool.make("leo_hardware_status", {
  ...shared,
  dependencies: [McpInvocationContext.McpInvocationContext, HardwareWatch.HardwareWatch],
  description:
    "Read this computer's newest CPU, memory, GPU and disk-free numbers, and its open hardware alerts. Check it before heavy builds or local models.",
  success: Schema.Struct({
    sampledAt: NullableNumber,
    cpu: Schema.NullOr(
      Schema.Struct({ loadPct: NullableNumber, tempC: NullableNumber, clockMhz: NullableNumber }),
    ),
    memory: Schema.NullOr(
      Schema.Struct({
        usedBytes: Schema.Number,
        totalBytes: Schema.Number,
        usedPct: NullableNumber,
      }),
    ),
    gpus: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        loadPct: NullableNumber,
        tempC: NullableNumber,
        vramUsedBytes: NullableNumber,
        vramTotalBytes: NullableNumber,
        vramUsedPct: NullableNumber,
      }),
    ),
    disks: Schema.Array(
      Schema.Struct({
        mount: Schema.String,
        freeBytes: Schema.Number,
        totalBytes: Schema.Number,
        usedPct: NullableNumber,
      }),
    ),
    activeAlerts: Schema.Array(
      Schema.Struct({
        metric: Schema.String,
        label: Schema.String,
        severity: Schema.String,
        value: Schema.Number,
        limit: Schema.Number,
        unit: Schema.String,
        message: Schema.String,
      }),
    ),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const ReviewDiffTool = Tool.make("leo_review_diff_get", {
  ...shared,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    ProjectService.ProjectService,
    ReviewService.ReviewService,
  ],
  description:
    "Read the diff of a thread's workspace (default: this thread). Each diff is cut at 30000 chars and flagged. `file` limits it to one file. `contentsOf` also returns that file's old and new text, cut at 20000 chars.",
  parameters: Schema.Struct({
    threadId: Schema.optional(ThreadId),
    baseRef: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
    ignoreWhitespace: Schema.optional(Schema.Boolean),
    file: Schema.optional(Schema.Struct({ path: Schema.String, sourceKind: RepoSourceKind })),
    contentsOf: Schema.optional(Schema.Struct({ path: Schema.String, sourceKind: RepoSourceKind })),
  }),
  success: Schema.Struct({
    cwd: Schema.String,
    sources: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        kind: RepoSourceKind,
        title: Schema.String,
        baseRef: Schema.NullOr(Schema.String),
        headRef: Schema.NullOr(Schema.String),
        diff: Schema.String,
        truncated: Schema.Boolean,
        files: Schema.Array(
          Schema.Struct({
            path: Schema.String,
            previousPath: Schema.NullOr(Schema.String),
            additions: Schema.Number,
            deletions: Schema.Number,
          }),
        ),
      }),
    ),
    contents: Schema.optional(
      Schema.Struct({
        path: Schema.String,
        oldContents: Schema.String,
        newContents: Schema.String,
        truncated: Schema.Boolean,
      }),
    ),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const PerfTurnReportTool = Tool.make("leo_perf_turn_report", {
  ...shared,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
  ],
  description:
    "Read timing and token counts for a thread's newest runs (default: this thread), newest first. `change` is the newest finished run minus the one before it. No message text. Use it for performance-gate numbers.",
  parameters: Schema.Struct({
    threadId: Schema.optional(ThreadId),
    limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }))),
  }),
  success: Schema.Struct({
    runs: Schema.Array(
      Schema.Struct({
        ordinal: Schema.Number,
        status: Schema.String,
        model: Schema.String,
        waitMs: NullableNumber,
        totalMs: NullableNumber,
        toolMs: Schema.Number,
        toolCalls: Schema.Number,
        inputTokens: NullableNumber,
        outputTokens: NullableNumber,
      }),
    ),
    change: Schema.NullOr(
      Schema.Struct({
        fromOrdinal: Schema.Number,
        toOrdinal: Schema.Number,
        totalMs: NullableNumber,
        toolMs: Schema.Number,
        inputTokens: NullableNumber,
        outputTokens: NullableNumber,
      }),
    ),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const CalendarEventsTool = Tool.make("leo_calendar_events", {
  ...shared,
  dependencies: [McpInvocationContext.McpInvocationContext, Calendar.Calendar],
  description:
    "Read the user's calendar events that start between two ISO timestamps (`from` before `to`, at most 92 days). Times are local wall-clock in `timeZone`. Plan work around them.",
  parameters: Schema.Struct({ from: Schema.String, to: Schema.String }),
  success: Schema.Struct({
    timeZone: Schema.String,
    events: Schema.Array(
      Schema.Struct({
        title: Schema.String,
        allDay: Schema.Boolean,
        start: Schema.String,
        end: Schema.String,
        location: Schema.optional(Schema.String),
        hasJoinLink: Schema.Boolean,
      }),
    ),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const ScribeInsightsTool = Tool.make("leo_scribe_insights", {
  ...shared,
  dependencies: [McpInvocationContext.McpInvocationContext, ScribeEngine.ScribeEngine],
  description:
    "Read the user's voice dictation numbers from Scribe: words, streaks, speed and daily goal. Counts only, never transcripts.",
  success: Schema.Struct({
    insights: Schema.Struct({
      words: Schema.Number,
      transcripts: Schema.Number,
      daysActive: Schema.Number,
      todayWords: Schema.Number,
      todayTranscripts: Schema.Number,
      streakDays: Schema.Number,
      weekAvgWords: Schema.Number,
      week: Schema.Struct({
        words: Schema.Number,
        prevWords: Schema.Number,
        topApp: Schema.String,
      }),
      p50Ms: Schema.Number,
      p90Ms: Schema.Number,
      byMode: Schema.Array(Schema.Struct({ key: Schema.String, count: Schema.Number })),
      byApp: Schema.Array(Schema.Struct({ key: Schema.String, count: Schema.Number })),
      truncated: Schema.Boolean,
    }),
    goals: Schema.Struct({
      level: Schema.Number,
      rank: Schema.String,
      xp: Schema.Number,
      today: Schema.Struct({
        words: Schema.Number,
        goal: Schema.Number,
        dictations: Schema.Number,
      }),
      streak: Schema.Number,
      bestStreak: Schema.Number,
      questsDone: Schema.Number,
    }),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const LocalModelsAdviceTool = Tool.make("leo_local_models_advice", {
  ...shared,
  dependencies: [McpInvocationContext.McpInvocationContext, LocalModelsService.LocalModelsService],
  description:
    "Pick the best installed local model for a task `size` (small = fastest, large = best score, default medium). Models too big for this PC never win. Run it with `leo_local_models_run`.",
  parameters: Schema.Struct({
    size: Schema.optional(Schema.Literals(["small", "medium", "large"])),
  }),
  success: Schema.Struct({
    ollamaRunning: Schema.Boolean,
    size: Schema.Literals(["small", "medium", "large"]),
    best: Schema.NullOr(
      Schema.Struct({
        model: Schema.String,
        sizeBytes: NullableNumber,
        fit: Schema.String,
        tokensPerSecond: NullableNumber,
        benchLm: NullableNumber,
        reason: Schema.String,
      }),
    ),
    installed: Schema.Array(
      Schema.Struct({ model: Schema.String, fit: Schema.String, loaded: Schema.Boolean }),
    ),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

const ChatQuotaUse = Schema.Struct({ points: Schema.Number, sharedPoints: Schema.Number });
const ChatQuotaTool = Tool.make("leo_chat_quota", {
  ...shared,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ProviderRegistry.ProviderRegistry,
    ServerConfig.ServerConfig,
    FileSystem.FileSystem,
    Path.Path,
  ],
  description:
    "Rank chats by the plan quota they used: five-hour and weekly percentage points per Claude account. `sharedPoints` may include other chats or devices. Use it for a quota audit.",
  parameters: Schema.Struct({
    days: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 30 }))),
    threadId: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
    limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
  }),
  success: Schema.Struct({
    method: Schema.String,
    coverageStart: Schema.NullOr(Schema.String),
    chats: Schema.Array(
      Schema.Struct({
        threadId: Schema.String,
        providerInstanceId: Schema.String,
        account: Schema.String,
        fiveHour: ChatQuotaUse,
        weekly: ChatQuotaUse,
        firstAt: Schema.String,
        lastAt: Schema.String,
      }),
    ),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const InsightToolkit = Toolkit.make(
  ChatQuotaTool,
  MemorySearchTool,
  MemoryReadTool,
  UsageStatusTool,
  ReleaseStatusTool,
  HardwareStatusTool,
  ReviewDiffTool,
  PerfTurnReportTool,
  CalendarEventsTool,
  ScribeInsightsTool,
  LocalModelsAdviceTool,
);

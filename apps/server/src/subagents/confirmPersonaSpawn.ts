/**
 * The spawn gate for every delegated child (ADR-0082): a free-tier model
 * starts at once; a confirm-tier model waits for the user's card unless this
 * thread already allowed it. Named subagents and plain `leo_delegate_task` both
 * pass through it.
 */
import {
  DEFAULT_SUBAGENT_TIER_GOOD_FOR,
  OrchestratorMcpFailure,
  type ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import { SpawnApprovals } from "./SpawnApprovals.ts";
import {
  estimatePersonaStartTokens,
  readAiosModelTiersNear,
  type ResolvedSpawnTier,
  resolveSpawnTier,
} from "./spawnTiers.ts";
import type { LoadedSubagentPersona } from "./subagentPersona.ts";

const denied = (message: string) =>
  new OrchestratorMcpFailure({ code: "capability_denied", message });

/**
 * How long one tool call waits for the card. An agent's tool client gives up at about 60 s, so
 * the call answers first. The card stays open and a retry with the same id joins it.
 */
const SPAWN_CALL_WAIT = Duration.seconds(45);

/** What the card shows next to the model, so the user sees what they approve. */
export interface SpawnCardDetails {
  readonly effort?: string | undefined;
  readonly runtimeMode?: string | undefined;
  readonly workspace?: string | null | undefined;
  readonly task?: string | undefined;
  readonly accountUsage?: string | undefined;
}

const cardDetails = (details: SpawnCardDetails | undefined) => ({
  ...(details?.effort === undefined ? {} : { effort: details.effort }),
  ...(details?.runtimeMode === undefined ? {} : { runtimeMode: details.runtimeMode }),
  ...(details?.workspace == null ? {} : { workspace: details.workspace }),
  ...(details?.task === undefined ? {} : { task: details.task.trim().slice(0, 400) }),
  ...(details?.accountUsage === undefined ? {} : { accountUsage: details.accountUsage }),
});

/** The card for one spawn: free tier starts at once, confirm tier waits for the user. */
const awaitSpawnCard = Effect.fnUntraced(function* (input: {
  readonly parent: { readonly thread: { readonly id: ThreadId; readonly title: string } };
  readonly subagent: string;
  readonly model: string;
  readonly account: string;
  readonly reason: string;
  readonly approvalId: string;
  readonly tier: Omit<ResolvedSpawnTier, "source"> & {
    readonly source: ResolvedSpawnTier["source"] | "subagent";
  };
  readonly filesInScope: ReadonlyArray<string>;
  readonly toolCount: number;
  readonly estimatedStartTokens: number;
  readonly engineNote?: string;
  readonly details?: SpawnCardDetails;
  /** Runs once when the spawn may start. */
  readonly started: Effect.Effect<void>;
}) {
  const { parent, subagent, model, tier, started } = input;
  const approvals = yield* SpawnApprovals;
  if (tier.tier === "free") return yield* started;
  if (yield* approvals.isAllowedForThread({ threadId: parent.thread.id, subagent, model })) {
    return yield* started;
  }
  const outcome = yield* approvals.request(
    {
      id: input.approvalId,
      threadId: parent.thread.id,
      threadTitle: parent.thread.title,
      subagent,
      model,
      account: input.account,
      reason: input.reason.trim().slice(0, 600),
      filesInScope: [...input.filesInScope],
      toolCount: input.toolCount,
      estimatedStartTokens: input.estimatedStartTokens,
      tierSource: tier.source,
      goodFor: tier.goodFor,
      ...(input.engineNote === undefined ? {} : { engineNote: input.engineNote }),
      ...cardDetails(input.details),
      requestedAt: DateTime.formatIso(yield* DateTime.now),
    },
    { waitFor: SPAWN_CALL_WAIT },
  );
  switch (outcome.kind) {
    case "still_waiting":
      return yield* new OrchestratorMcpFailure({
        code: "approval_pending",
        message: `No task started. The user has not answered the approval card for ${subagent} on ${model} (${input.account}) yet. Do not start another task. Tell the user to answer the card in Leonidas. Then call delegate_task again with the same task and the same clientRequestId: the retry joins this card. Run leo_thread_list first if you are not sure.`,
      });
    case "allow_once":
    case "allow_thread":
      return yield* started;
    case "deny":
      return yield* denied(
        `The user denied the ${subagent} spawn on ${model}. Do not retry it; continue without this subagent or ask the user.`,
      );
    case "redirect":
      return yield* denied(
        `The user stopped the ${subagent} spawn on ${model} and redirected you: ${outcome.text}`,
      );
    case "timed_out":
      return yield* denied(
        `Nobody answered the ${subagent} spawn card on ${model} in 15 minutes, so it did not start.`,
      );
  }
});

const readTiers = (path: string) =>
  Effect.try({
    try: () => readAiosModelTiersNear(path),
    catch: (error) =>
      new OrchestratorMcpFailure({
        code: "invalid_request",
        message: error instanceof Error ? error.message : String(error),
      }),
  });

/** Free-tier spawns pass; confirm-tier spawns wait for the user's card (ADR-0082). */
export const confirmPersonaSpawn = Effect.fn("confirmPersonaSpawn")(function* (input: {
  readonly persona: LoadedSubagentPersona;
  readonly parent: { readonly thread: { readonly id: ThreadId; readonly title: string } };
  readonly model: string;
  readonly account: string;
  readonly reason: string;
  readonly appFreeModels: ReadonlyArray<string>;
  readonly approvalId: string;
  readonly engineNote?: string;
  readonly details?: SpawnCardDetails;
}) {
  const { persona, model, appFreeModels } = input;
  const approvals = yield* SpawnApprovals;
  const estimatedStartTokens = estimatePersonaStartTokens({
    systemPromptChars: persona.systemPrompt.length,
    tools: persona.spec.tools,
  });
  const aios = yield* readTiers(persona.specPath);
  const mapped = resolveSpawnTier({ model, appFreeModels, aios });
  // A spec may raise its own tier to confirm, never lower it.
  const tier =
    persona.spec.tier === "confirm" && mapped.tier === "free"
      ? {
          tier: "confirm" as const,
          source: "subagent" as const,
          goodFor: DEFAULT_SUBAGENT_TIER_GOOD_FOR.confirm,
        }
      : mapped;
  return yield* awaitSpawnCard({
    parent: input.parent,
    subagent: persona.spec.name,
    model,
    account: input.account,
    reason: input.reason,
    approvalId: input.approvalId,
    tier,
    filesInScope: persona.spec.context.map((entry) => entry.path),
    toolCount: persona.spec.tools.length,
    estimatedStartTokens,
    ...(input.engineNote === undefined ? {} : { engineNote: input.engineNote }),
    ...(input.details === undefined ? {} : { details: input.details }),
    started: approvals.recordSpawn(estimatedStartTokens),
  });
});

/** The card label for a `leo_delegate_task` that names no subagent. */
const DELEGATED_TASK_SPAWN_LABEL = "delegated task";

/**
 * The same gate for a plain `leo_delegate_task` (no subagent): a confirm-tier
 * model waits for the user's card. `cwd` finds the AIOS model-tiers.json;
 * null uses the app's free list only.
 */
export const confirmDelegatedSpawn = Effect.fn("confirmDelegatedSpawn")(function* (input: {
  readonly parent: { readonly thread: { readonly id: ThreadId; readonly title: string } };
  readonly cwd: string | null;
  readonly task: string;
  readonly model: string;
  readonly account: string;
  readonly reason: string;
  readonly appFreeModels: ReadonlyArray<string>;
  readonly approvalId: string;
  readonly details?: SpawnCardDetails;
}) {
  const aios = input.cwd === null ? null : yield* readTiers(`${input.cwd}/.agents`);
  return yield* awaitSpawnCard({
    parent: input.parent,
    subagent: DELEGATED_TASK_SPAWN_LABEL,
    model: input.model,
    account: input.account,
    reason: input.reason,
    approvalId: input.approvalId,
    tier: resolveSpawnTier({ model: input.model, appFreeModels: input.appFreeModels, aios }),
    filesInScope: [],
    toolCount: 0,
    estimatedStartTokens: estimatePersonaStartTokens({
      systemPromptChars: input.task.length,
      tools: [],
    }),
    ...(input.details === undefined ? {} : { details: input.details }),
    started: Effect.void,
  });
});

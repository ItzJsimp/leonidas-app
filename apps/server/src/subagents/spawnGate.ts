/**
 * The spawn gate (ADR-0082, ADR-0098). One pure decision for every way a
 * subagent can start: app delegate, persona spawns, the creator draft and
 * native Claude Agent tool calls. It returns `start` (no card), `card` (ask
 * the user first) or `reject` (the model reads the reason).
 */
import { resolveSpawnTier, type AiosModelTiers } from "./spawnTiers.ts";

export const MAX_RUNNING_CHILDREN = 3;
const CAP_WARNING_FRACTION = 0.8;

export interface SpawnGateInput {
  readonly model: string;
  readonly appFreeModels: ReadonlyArray<string>;
  readonly aios: AiosModelTiers | null;
  /** An agent file can force the card with `tier: confirm`. It can never lower the tier. */
  readonly forceConfirm?: boolean;
  /** Persona ancestors of the calling chat: 0 is a top-level chat, 1 an orchestrator child. */
  readonly callerDepth: number;
  /** The caller's agent has `canSpawn: true`. Only read at depth 1. */
  readonly callerCanSpawn: boolean;
  /** Children of the same parent that are running now. */
  readonly runningChildren: number;
  /** Subagent run cost today for the account that would pay, in USD. */
  readonly todaySpendUsd: number;
  readonly dailyCapUsd: number;
}

export type SpawnGateDecision =
  | { readonly kind: "start" | "card"; readonly capWarning: boolean }
  | { readonly kind: "reject"; readonly reason: string };

export function decideSpawn(input: SpawnGateInput): SpawnGateDecision {
  if (input.callerDepth >= 2 || (input.callerDepth === 1 && !input.callerCanSpawn)) {
    return {
      kind: "reject",
      reason: "This agent cannot start subagents. Only a top-level chat or an orchestrator can.",
    };
  }
  if (input.runningChildren >= MAX_RUNNING_CHILDREN) {
    return {
      kind: "reject",
      reason: `${MAX_RUNNING_CHILDREN} subagents already run for this parent. Wait for one to finish.`,
    };
  }
  if (input.todaySpendUsd >= input.dailyCapUsd) {
    return {
      kind: "reject",
      reason: `The daily subagent cap of $${input.dailyCapUsd.toFixed(2)} is used. Raise it in Settings.`,
    };
  }
  const tier =
    input.forceConfirm === true
      ? "confirm"
      : resolveSpawnTier({
          model: input.model,
          appFreeModels: input.appFreeModels,
          aios: input.aios,
        }).tier;
  return {
    kind: tier === "free" ? "start" : "card",
    capWarning: input.todaySpendUsd >= input.dailyCapUsd * CAP_WARNING_FRACTION,
  };
}

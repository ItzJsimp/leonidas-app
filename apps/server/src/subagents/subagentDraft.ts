/**
 * The creator chat's draft (S7): one sentence in, the text of an agent file out. Nothing is
 * written; the editor saves the draft. The model call passes the spawn gate first (ADR-0098):
 * the daily cap can refuse it, and a confirm-tier model needs `confirmed: true`.
 */
import {
  type ProviderInstanceId,
  type ServerProviderAuthStatus,
  type ServerProviderState,
  SubagentEditError,
  type SubagentDraftInput,
  type SubagentDraftResult,
  type TextGenerationError,
} from "@t3tools/contracts";
import type {
  AgentDraftInput,
  AgentDraftParts,
  AgentDraftResult,
} from "@t3tools/provider-core/server/agentDraft";
import * as Effect from "effect/Effect";
import { Document, isSeq } from "yaml";

import type { TokenRates } from "../usage/usagePricing.ts";
import { instanceForModel } from "./instanceForModel.ts";
import { estimateSpawnCostUsd, formatRoughCost } from "./spawnCost.ts";
import { decideSpawn } from "./spawnGate.ts";
import type { AiosModelTiers } from "./spawnTiers.ts";
import { parseSubagentSpec } from "./subagentPersona.ts";

/** The built-in tools a draft may pick from. */
export const DRAFT_TOOLS: ReadonlyArray<string> = [
  "Read",
  "Grep",
  "Glob",
  "Edit",
  "Write",
  "Bash",
  "WebSearch",
  "WebFetch",
];

/** Prompt plus one revision, for the "about $X" on the confirm step. */
const DRAFT_START_TOKENS = 2_500;

/** Builds the agent file text. Throws when the result does not resolve under format v1. */
export function assembleDraft(input: {
  readonly name: string;
  readonly avatar?: string | undefined;
  readonly model: string;
  readonly parts: AgentDraftParts;
}): string {
  const doc = new Document({
    name: input.name,
    description: input.parts.description,
    model: input.model,
    ...(input.avatar === undefined ? {} : { avatar: input.avatar }),
    scope: "structural",
    enabled: true,
    tools: [...input.parts.tools],
    context: [],
    never: [...input.parts.never],
  });
  // Tools read best on one line, like the files written by hand.
  const tools = doc.get("tools", true);
  if (isSeq(tools)) tools.flow = true;
  const context = doc.get("context", true);
  if (isSeq(context)) context.flow = true;
  const text = `---\n${doc.toString({ lineWidth: 0 }).trimEnd()}\n---\n\n${input.parts.instructions.trim()}\n`;
  parseSubagentSpec(text, input.name);
  return text;
}

/** The parts the model may revise, read from the editor's draft text. Undefined when it is not a valid file. */
export function readDraftParts(
  text: string,
  name: string,
): Pick<AgentDraftParts, "description" | "instructions" | "tools"> | undefined {
  try {
    const spec = parseSubagentSpec(text, name);
    return {
      description: spec.description ?? "",
      instructions: spec.body,
      tools: spec.tools ?? [],
    };
  } catch {
    return undefined;
  }
}

/** The provider fields the pick needs. A `ServerProvider` fits. */
export interface DraftProvider {
  readonly instanceId: ProviderInstanceId;
  readonly models: ReadonlyArray<{ readonly slug: string }>;
  readonly enabled: boolean;
  readonly installed: boolean;
  readonly status: ServerProviderState;
  readonly auth: { readonly status: ServerProviderAuthStatus };
}

const canRun = (provider: DraftProvider) =>
  provider.enabled &&
  provider.installed &&
  provider.status !== "error" &&
  provider.status !== "disabled" &&
  provider.auth.status !== "unauthenticated";

/** The account that runs the draft: the chat's own when it offers the model, else the first that does. */
export function pickDraftInstance(
  providers: ReadonlyArray<DraftProvider>,
  model: string,
  preferred: ProviderInstanceId,
) {
  return instanceForModel(providers, model, preferred, canRun);
}

export interface DraftDeps {
  /** The folder the model call runs in. The draft reads no project files. */
  readonly cwd: string;
  readonly providers: Effect.Effect<ReadonlyArray<DraftProvider>>;
  /** The account of the user's chat model, tried first. */
  readonly preferredInstanceId: Effect.Effect<ProviderInstanceId>;
  readonly appFreeModels: Effect.Effect<ReadonlyArray<string>>;
  readonly dailyCapUsd: Effect.Effect<number>;
  readonly aiosTiers: Effect.Effect<AiosModelTiers | null>;
  /** Subagent run cost today for the account, in USD. */
  readonly spendToday: (account: ProviderInstanceId) => Effect.Effect<number, SubagentEditError>;
  readonly rate: (model: string) => Effect.Effect<TokenRates | null>;
  readonly generate: (
    input: AgentDraftInput,
  ) => Effect.Effect<AgentDraftResult, TextGenerationError>;
}

const fail = (message: string) => new SubagentEditError({ message });

export const makeDraft = (deps: DraftDeps) =>
  Effect.fn("SubagentDraft.draft")(function* (
    input: SubagentDraftInput,
  ): Effect.fn.Return<SubagentDraftResult, SubagentEditError> {
    const instanceId = pickDraftInstance(
      yield* deps.providers,
      input.model,
      yield* deps.preferredInstanceId,
    );
    if (instanceId === undefined) {
      return yield* fail(`No connected account offers ${input.model}. Pick another model.`);
    }
    const todaySpendUsd = yield* deps.spendToday(instanceId);
    const dailyCapUsd = yield* deps.dailyCapUsd;
    // The user, not a chat, asks: depth 0, no running children.
    const decision = decideSpawn({
      model: input.model,
      appFreeModels: yield* deps.appFreeModels,
      aios: yield* deps.aiosTiers,
      callerDepth: 0,
      callerCanSpawn: false,
      runningChildren: 0,
      todaySpendUsd,
      dailyCapUsd,
    });
    if (decision.kind === "reject") return yield* fail(decision.reason);
    const roughCost = formatRoughCost(
      estimateSpawnCostUsd({
        startTokens: DRAFT_START_TOKENS,
        rate: yield* deps.rate(input.model),
      }),
    );
    if (decision.kind === "card" && input.confirmed !== true) {
      return {
        kind: "needs_confirm",
        model: input.model,
        roughCost,
        capWarning: decision.capWarning,
      };
    }
    const parts = yield* deps
      .generate({
        cwd: deps.cwd,
        name: input.name,
        request: input.request,
        currentDraft:
          input.currentDraft === undefined
            ? undefined
            : readDraftParts(input.currentDraft, input.name),
        tools: DRAFT_TOOLS,
        modelSelection: { instanceId, model: input.model },
      })
      .pipe(Effect.mapError((error) => fail(`The draft failed. ${error.message}`)));
    const contents = yield* Effect.try({
      try: () =>
        assembleDraft({ name: input.name, avatar: input.avatar, model: input.model, parts }),
      catch: (error) =>
        fail(`The draft is not a valid agent file. ${error instanceof Error ? error.message : ""}`),
    });
    return {
      kind: "draft",
      contents,
      model: input.model,
      roughCost,
      capWarning: decision.capWarning,
    };
  });

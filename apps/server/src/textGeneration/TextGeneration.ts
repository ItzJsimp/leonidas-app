import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { ProviderInstanceId } from "@t3tools/contracts";
import type { ProviderTextGeneration } from "@t3tools/provider-core/server/textGeneration";
import { TextGenerationError } from "@t3tools/contracts";

import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import type { ProviderInstance } from "@t3tools/provider-core/server/driver";
import * as SourceControlProviderRegistry from "../sourceControl/SourceControlProviderRegistry.ts";
import * as ThreadTitleLinks from "./ThreadTitleLinks.ts";

export type {
  BranchNameGenerationInput,
  BranchNameGenerationResult,
  CommitMessageGenerationInput,
  CommitMessageGenerationResult,
  PrContentGenerationInput,
  PrContentGenerationResult,
  ThreadTitleGenerationInput,
  PromptSuggestionInput,
  PromptSuggestionResult,
  ThreadTitleGenerationResult,
} from "@t3tools/provider-core/server/textGeneration";

/**
 * TextGeneration - Service tag for commit and change request text generation.
 */
export class TextGeneration extends Context.Service<TextGeneration, ProviderTextGeneration>()(
  "t3/textGeneration/TextGeneration",
) {}

type TextGenerationOp =
  | "improveImagePrompt"
  | "generateCommitMessage"
  | "generatePrContent"
  | "generateBranchName"
  | "generateThreadTitle"
  | "evaluateGoal"
  | "assessThread"
  | "generatePromptSuggestion"
  | "pickSkills"
  | "generateVoiceLogDraft";

const resolveInstance = (
  registry: ProviderInstanceRegistry.ProviderInstanceRegistry["Service"],
  operation: TextGenerationOp,
  instanceId: ProviderInstanceId,
): Effect.Effect<ProviderInstance["textGeneration"], TextGenerationError> =>
  registry.getInstance(instanceId).pipe(
    Effect.flatMap((instance) =>
      instance
        ? Effect.succeed(instance.textGeneration)
        : Effect.fail(
            new TextGenerationError({
              operation,
              detail: `No provider instance registered for id '${instanceId}'.`,
            }),
          ),
    ),
  );

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const registry = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
  const sourceControl = yield* SourceControlProviderRegistry.SourceControlProviderRegistry;
  return TextGeneration.of({
    improveImagePrompt: (input) =>
      resolveInstance(registry, "improveImagePrompt", input.modelSelection.instanceId).pipe(
        Effect.flatMap((generation) =>
          generation.improveImagePrompt
            ? generation.improveImagePrompt(input)
            : Effect.fail(
                new TextGenerationError({
                  operation: "improveImagePrompt",
                  detail: "This account cannot improve image prompts.",
                }),
              ),
        ),
      ),
    generateVoiceLogDraft: (input) =>
      resolveInstance(registry, "generateVoiceLogDraft", input.modelSelection.instanceId).pipe(
        Effect.flatMap((generation) =>
          generation.generateVoiceLogDraft
            ? generation.generateVoiceLogDraft(input)
            : Effect.fail(
                new TextGenerationError({
                  operation: "generateVoiceLogDraft",
                  detail: "This account cannot draft voice-log memories.",
                }),
              ),
        ),
      ),
    generatePromptSuggestion: (input) =>
      resolveInstance(registry, "generatePromptSuggestion", input.modelSelection.instanceId).pipe(
        Effect.flatMap((generation) =>
          generation.generatePromptSuggestion
            ? generation.generatePromptSuggestion(input)
            : Effect.fail(
                new TextGenerationError({
                  operation: "generatePromptSuggestion",
                  detail: "This provider does not support prompt prediction.",
                }),
              ),
        ),
      ),
    pickSkills: (input) =>
      resolveInstance(registry, "pickSkills", input.modelSelection.instanceId).pipe(
        Effect.flatMap((generation) =>
          generation.pickSkills
            ? generation.pickSkills(input)
            : Effect.fail(
                new TextGenerationError({
                  operation: "pickSkills",
                  detail: "This provider cannot pick skills.",
                }),
              ),
        ),
      ),
    assessThread: (input) =>
      resolveInstance(registry, "assessThread", input.modelSelection.instanceId).pipe(
        Effect.flatMap((generation) =>
          generation.assessThread
            ? generation.assessThread(input)
            : Effect.fail(
                new TextGenerationError({
                  operation: "assessThread",
                  detail: "This provider does not support thread assessment.",
                }),
              ),
        ),
      ),
    evaluateGoal: (input) =>
      resolveInstance(registry, "evaluateGoal", input.modelSelection.instanceId).pipe(
        Effect.flatMap((generation) =>
          generation.evaluateGoal
            ? generation.evaluateGoal(input)
            : Effect.fail(
                new TextGenerationError({
                  operation: "evaluateGoal",
                  detail: "This provider does not support goal evaluation.",
                }),
              ),
        ),
      ),
    generateCommitMessage: (input) =>
      resolveInstance(registry, "generateCommitMessage", input.modelSelection.instanceId).pipe(
        Effect.flatMap((textGeneration) => textGeneration.generateCommitMessage(input)),
      ),
    generatePrContent: (input) =>
      resolveInstance(registry, "generatePrContent", input.modelSelection.instanceId).pipe(
        Effect.flatMap((textGeneration) => textGeneration.generatePrContent(input)),
      ),
    generateBranchName: (input) =>
      resolveInstance(registry, "generateBranchName", input.modelSelection.instanceId).pipe(
        Effect.flatMap((textGeneration) => textGeneration.generateBranchName(input)),
      ),
    generateThreadTitle: (input) =>
      resolveInstance(registry, "generateThreadTitle", input.modelSelection.instanceId).pipe(
        Effect.flatMap((textGeneration) =>
          Effect.gen(function* () {
            const linkedContext =
              input.linkedContext ??
              (yield* ThreadTitleLinks.resolveThreadTitleLinks(input).pipe(
                Effect.provideService(
                  SourceControlProviderRegistry.SourceControlProviderRegistry,
                  sourceControl,
                ),
              ));
            return yield* textGeneration.generateThreadTitle({ ...input, linkedContext });
          }),
        ),
      ),
  });
});

export const layer = Layer.effect(TextGeneration, make);

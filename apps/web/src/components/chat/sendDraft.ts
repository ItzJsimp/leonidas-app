import type {
  PreviewAnnotationPayload,
  ProviderDriverKind,
  ServerProvider,
} from "@t3tools/contracts";
import { PROVIDER_SEND_TURN_MAX_ATTACHMENTS } from "@t3tools/contracts";
import { applyClaudePromptEffortPrefix, resolvePromptInjectedEffort } from "@t3tools/shared/model";
import type { ComposerImageAttachment } from "../../composerDraftStore";
import { ensureInlineContextReferences } from "../../lib/composerContextReferences";
import { previewAnnotationContextReference } from "../../lib/composerContextRecords";
import { getProviderModelCapabilities } from "../../providerModels";
import { deriveComposerSendState } from "../ChatView.logic";
import { withAttachedSubagent } from "../subagents/subagentThread.logic";
import type { ComposerSendContext, TurnSubmissionSnapshot } from "./turnSubmission";

/** The draft as it will be sent: pure helpers of the turn submission module. */
export function formatOutgoingPrompt(params: {
  provider: ProviderDriverKind;
  model: string | null;
  models: ReadonlyArray<ServerProvider["models"][number]>;
  effort: string | null;
  text: string;
}): string {
  const caps = getProviderModelCapabilities(params.models, params.model, params.provider);
  const promptEffort = resolvePromptInjectedEffort(caps, params.effort);
  return applyClaudePromptEffortPrefix(params.text, promptEffort);
}

export interface DirectAnnotation {
  readonly annotation: PreviewAnnotationPayload;
  readonly image: ComposerImageAttachment | null;
}

/** The draft as it will be sent, after the annotation and subagent are applied. */
export interface PreparedDraft {
  readonly composerImages: ReadonlyArray<ComposerImageAttachment>;
  readonly composerPreviewAnnotations: ReadonlyArray<PreviewAnnotationPayload>;
  readonly promptForSend: string;
  readonly trimmedPrompt: string;
  readonly sendableTerminalContexts: ComposerSendContext["terminalContexts"];
  readonly expiredTerminalContextCount: number;
  readonly hasSendableContent: boolean;
}

/** Adds a direct annotation's image and chip, and the attached subagent, to the draft. */
export function prepareDraft(
  snapshot: Pick<
    TurnSubmissionSnapshot,
    "prompt" | "directAnnotation" | "attachedSubagent" | "subagentNames"
  >,
  sendContext: ComposerSendContext,
): PreparedDraft {
  const { directAnnotation } = snapshot;
  const annotationImageAlreadyAttached =
    directAnnotation?.image !== undefined &&
    sendContext.images.some((image) => image.id === directAnnotation.image?.id);
  // A full composer (e.g. 8 files) cannot take the annotation screenshot;
  // over the cap the server rejects the whole turn.
  const annotationImageAppended =
    directAnnotation?.image !== undefined &&
    !annotationImageAlreadyAttached &&
    sendContext.images.length + sendContext.files.length < PROVIDER_SEND_TURN_MAX_ATTACHMENTS;
  const composerImages =
    directAnnotation?.image && annotationImageAppended
      ? [...sendContext.images, directAnnotation.image]
      : sendContext.images;
  const composerPreviewAnnotations =
    directAnnotation &&
    !sendContext.previewAnnotations.some(
      (annotation) => annotation.id === directAnnotation.annotation.id,
    )
      ? [
          ...sendContext.previewAnnotations,
          {
            ...directAnnotation.annotation,
            // Claim an attached crop only when the screenshot really rides
            // along; a cap-dropped image must not produce a lying prompt.
            screenshot:
              directAnnotation.annotation.screenshot &&
              (annotationImageAppended || annotationImageAlreadyAttached)
                ? { ...directAnnotation.annotation.screenshot, dataUrl: "" }
                : null,
          },
        ]
      : sendContext.previewAnnotations;
  // A direct "send annotation" writes the draft and sends in the same tick; the reference
  // must be in the text now, not after the next render.
  const promptWithAnnotation = directAnnotation
    ? ensureInlineContextReferences(snapshot.prompt, [
        previewAnnotationContextReference(directAnnotation.annotation),
      ])
    : snapshot.prompt;
  // An attached subagent leads every message of this chat, so the attach holds across turns.
  const promptForSend = withAttachedSubagent(
    promptWithAnnotation,
    snapshot.attachedSubagent,
    snapshot.subagentNames,
  );
  const {
    trimmedPrompt,
    sendableTerminalContexts,
    expiredTerminalContextCount,
    hasSendableContent,
  } = deriveComposerSendState({
    prompt: promptForSend,
    imageCount: composerImages.length + sendContext.files.length,
    terminalContexts: sendContext.terminalContexts,
    elementContextCount:
      composerPreviewAnnotations.length +
      sendContext.reviewComments.length +
      sendContext.threadContexts.length,
  });
  return {
    composerImages,
    composerPreviewAnnotations,
    promptForSend,
    trimmedPrompt,
    sendableTerminalContexts,
    expiredTerminalContextCount,
    hasSendableContent,
  };
}

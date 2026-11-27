import type { ComposerDispatchMode } from "@t3tools/client-runtime/state/composer-dispatch";
import { ATTACHMENT_ONLY_BOOTSTRAP_PROMPT } from "@t3tools/shared/composerContextReferences";
import { assistantCitationsToPlainText } from "@t3tools/shared/assistantCitations";
import { truncate } from "@t3tools/shared/String";
import {
  buildMessageContext,
  previewAnnotationContextLabel,
  reviewCommentContextLabel,
  terminalContextReference,
} from "../../lib/composerContextRecords";
import {
  removeInlineContextReference,
  stripInlineContextReferences,
} from "../../lib/composerContextReferences";
import { formatTerminalContextLabel } from "../../lib/terminalContext";
import type { ReviewCommentContext } from "../../reviewCommentContext";
import { formatOutgoingPrompt, type PreparedDraft } from "./sendDraft";
import type { ComposerSendContext } from "./turnSubmission";

/**
 * The pure part of the normal turn path: what the message says, what it carries,
 * and whether it waits behind other work. No state is read or written here.
 */
export interface TurnPreparationInput {
  readonly sendContext: ComposerSendContext;
  readonly draft: PreparedDraft;
  readonly dispatchMode: ComposerDispatchMode;
  readonly phase: string;
  readonly sendQueuesBehindSetup: boolean;
  /** Tokens of a stale Claude session, or null when it needs no compaction. */
  readonly resumeCompactionTokens: number | null;
  readonly keepFullHistory: boolean;
}

export function prepareOutgoingTurn(input: TurnPreparationInput) {
  const { sendContext, draft, dispatchMode, phase, sendQueuesBehindSetup } = input;
  const composerImagesSnapshot = [...draft.composerImages];
  const composerFilesSnapshot = [...sendContext.files];
  const composerAttachmentsSnapshot = [...composerImagesSnapshot, ...composerFilesSnapshot];
  const composerTerminalContextsSnapshot = [...draft.sendableTerminalContexts];
  const composerPreviewAnnotationsSnapshot = [...draft.composerPreviewAnnotations];
  const composerReviewCommentsSnapshot: ReviewCommentContext[] = [...sendContext.reviewComments];
  const composerThreadContextsSnapshot = [...sendContext.threadContexts];
  // Expired terminal excerpts are not sent; their chips leave the text with them.
  const messageTextForSend = sendContext.terminalContexts
    .filter((context) => !composerTerminalContextsSnapshot.includes(context))
    .reduce(
      (text, context) =>
        removeInlineContextReference(text, terminalContextReference(context).contextId).prompt,
      draft.promptForSend,
    )
    .trim();
  // Records bind attachments by the id each side knows: the local id for the optimistic
  // row, the upload id (or local id on the data-URL path) on the wire; the server
  // rebinds them to the persisted id.
  const buildOutgoingMessageContext = (attachmentIds: ReadonlyArray<string>) =>
    buildMessageContext({
      terminalContexts: composerTerminalContextsSnapshot,
      reviewComments: composerReviewCommentsSnapshot,
      previewAnnotations: composerPreviewAnnotationsSnapshot,
      threadContexts: composerThreadContextsSnapshot,
      attachments: composerAttachmentsSnapshot.map((attachment, index) => ({
        attachment,
        attachmentId: attachmentIds[index] ?? attachment.id,
      })),
    });
  const outgoingMessageContext = buildOutgoingMessageContext(
    composerAttachmentsSnapshot.map((attachment) => attachment.id),
  );
  // A stale Claude session compacts before this message so the turn does not re-read the
  // old history. The message queues behind the /compact run, since steering into it is
  // rejected.
  const compactBeforeSend =
    input.resumeCompactionTokens !== null &&
    !input.keepFullHistory &&
    messageTextForSend.toLowerCase() !== "/compact";
  const turnDispatchMode = compactBeforeSend || sendQueuesBehindSetup ? "queue" : dispatchMode;
  const shouldQueueBehindActiveRun =
    compactBeforeSend || sendQueuesBehindSetup || (phase === "running" && dispatchMode === "queue");
  const outgoingMessageText = formatOutgoingPrompt({
    provider: sendContext.selectedProvider,
    model: sendContext.selectedModel,
    models: sendContext.selectedProviderModels,
    effort: sendContext.selectedPromptEffort,
    text: messageTextForSend || ATTACHMENT_ONLY_BOOTSTRAP_PROMPT,
  });
  const optimisticAttachments = composerAttachmentsSnapshot.map((attachment) =>
    attachment.type === "image"
      ? {
          type: "image" as const,
          id: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          previewUrl: attachment.previewUrl,
          ...(attachment.source ? { source: attachment.source } : {}),
        }
      : {
          type: "file" as const,
          id: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          downloadable: false,
          ...(attachment.source ? { source: attachment.source } : {}),
        },
  );
  let titleSeed = assistantCitationsToPlainText(
    stripInlineContextReferences(draft.trimmedPrompt),
  ).trim();
  if (!titleSeed) {
    if (composerImagesSnapshot[0]) {
      titleSeed = `Image: ${composerImagesSnapshot[0].name}`;
    } else if (composerFilesSnapshot[0]) {
      titleSeed = `File: ${composerFilesSnapshot[0].name}`;
    } else if (composerTerminalContextsSnapshot.length > 0) {
      titleSeed = formatTerminalContextLabel(composerTerminalContextsSnapshot[0]!);
    } else if (composerReviewCommentsSnapshot.length > 0) {
      titleSeed = `Review: ${reviewCommentContextLabel(composerReviewCommentsSnapshot[0]!)}`;
    } else if (composerPreviewAnnotationsSnapshot.length > 0) {
      titleSeed = previewAnnotationContextLabel(composerPreviewAnnotationsSnapshot[0]!);
    } else {
      titleSeed = "New chat";
    }
  }
  return {
    composerImagesSnapshot,
    composerFilesSnapshot,
    composerAttachmentsSnapshot,
    composerTerminalContextsSnapshot,
    composerPreviewAnnotationsSnapshot,
    composerReviewCommentsSnapshot,
    composerThreadContextsSnapshot,
    messageTextForSend,
    buildOutgoingMessageContext,
    outgoingMessageContext,
    compactBeforeSend,
    turnDispatchMode,
    shouldQueueBehindActiveRun,
    outgoingMessageText,
    optimisticAttachments,
    title: truncate(titleSeed),
  };
}

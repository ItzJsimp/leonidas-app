import type { ComposerSubmissionIntent } from "../../composer-logic";
import { parseStandaloneComposerSlashCommand } from "../../composer-logic";
import type {
  ChatAttachment,
  MessageId,
  OrchestrationMessageContext,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import { PROVIDER_SEND_TURN_MAX_ATTACHMENTS } from "@t3tools/contracts";
import {
  parseCodexFeedbackCommand,
  submitCodexFeedback,
} from "@t3tools/client-runtime/state/threads";
import { ATTACHMENT_ONLY_BOOTSTRAP_PROMPT } from "@t3tools/shared/composerContextReferences";
import { parseThreadGoalCommand } from "@t3tools/shared/threadGoalCommand";
import { isUsageLimitsCommand } from "@t3tools/shared/usageLimits";
import type { ComposerFileAttachment, ComposerImageAttachment } from "../../composerDraftStore";
import { buildMessageContext } from "../../lib/composerContextRecords";
import { isStuckPhrase } from "~/lib/community/stuckReport";
import { newMessageId } from "~/lib/utils";
import { resolvePlanFollowUpSubmission } from "../../proposedPlan";
import {
  buildExpiredTerminalContextToastCopy,
  type PlanFollowUpComposerSnapshot,
  readFileAsDataUrl,
} from "../ChatView.logic";
import type { toastManager } from "../ui/toast";
import { stackedThreadToast } from "../ui/toastHelpers";
import type { ChatComposerHandle } from "./ChatComposer";
import { prepareQueuedEditAttachments } from "./queuedMessageEdit";
import {
  type DirectAnnotation,
  formatOutgoingPrompt,
  type PreparedDraft,
  prepareDraft,
} from "./sendDraft";

/**
 * The turn submission module: what happens when the user presses Send.
 * Slices 1 and 2 of 4: the guards, then the routes that finish without a new turn
 * (queued edit, Codex feedback, plan follow-up, slash command, empty draft).
 * Design: logs/grill-sessions/2026-11-25-turn-submission-module.md.
 */

export type ComposerSendContext = ReturnType<ChatComposerHandle["getSendContext"]>;
type Toast = Parameters<typeof toastManager.add>[0];
type FeedbackSubmission = Parameters<Parameters<typeof submitCodexFeedback>[0]["onUpdate"]>[0];
type FeedbackUploadResult = Awaited<
  ReturnType<Parameters<typeof submitCodexFeedback>[0]["upload"]>
>;
type MessageContext = ReturnType<typeof buildMessageContext>;

/** The waiting message the composer edits instead of sending a new one. */
export interface EditingQueuedRun {
  readonly threadId: ThreadId;
  readonly runId: RunId;
  readonly messageId: MessageId;
  readonly originalText: string;
  readonly existingAttachments: ReadonlyArray<ChatAttachment>;
  readonly context?: OrchestrationMessageContext | undefined;
}

/** State read once, at the moment the user pressed Send. */
export interface TurnSubmissionSnapshot {
  readonly prompt: string;
  readonly directAnnotation: DirectAnnotation | null;
  /** Attachments or contexts mean the user sends a prompt, not a typed command. */
  readonly hasNonPromptContent: boolean;
  readonly activeThreadId: ThreadId | null;
  readonly isServerThread: boolean;
  readonly hasProviderThread: boolean;
  readonly hasActiveProject: boolean;
  readonly canOperate: boolean;
  readonly usageLimitsAvailable: boolean;
  readonly stuckReportEnabled: boolean;
  /** Each true value means another action is running, so this send must wait. */
  readonly busy: {
    readonly sendBusyNotQueuable: boolean;
    readonly connecting: boolean;
    readonly revertingCheckpoint: boolean;
    readonly settingsNotHydrated: boolean;
    readonly threadDetailLoading: boolean;
    readonly environmentChanging: boolean;
    readonly sendInFlight: boolean;
    readonly feedbackUploadInFlight: boolean;
  };
  readonly loadBalancing: { readonly needed: boolean; readonly pending: boolean };
  readonly environmentUnavailable: boolean;
  readonly hasPendingUserInput: boolean;
  readonly multiModel: {
    readonly worktreeBootstrapSupported: boolean;
    readonly isLocalDraftThread: boolean;
    readonly isGitRepo: boolean;
  };
  readonly activeThreadBranch: string | null;
  readonly attachedSubagent: string | null;
  readonly subagentNames: ReadonlySet<string>;
  readonly editingQueuedRun: EditingQueuedRun | null;
  /** Set when the composer shows the follow-up prompt for a proposed plan. */
  readonly planFollowUp: { readonly planMarkdown: string } | null;
  readonly submissionIntent: ComposerSubmissionIntent;
  /** Inputs that decide whether this send creates a new worktree. */
  readonly worktree: {
    readonly sendQueuesBehindSetup: boolean;
    readonly activeMessageCount: number;
    readonly envMode: string;
    readonly existingWorktreePath: string | null;
  };
}

export interface TurnSubmissionPorts {
  readonly drafts: {
    /** Empty the prompt and reset the composer cursor. */
    readonly clearPrompt: () => void;
    /** Empty the prompt and all chips of the draft. */
    readonly clearDraft: () => void;
    /** Leave queued edit mode after a save, with an empty edit draft. */
    readonly finishQueuedEdit: (runId: RunId) => void;
    readonly releaseAttachments: (
      attachments: ReadonlyArray<ComposerImageAttachment | ComposerFileAttachment>,
    ) => void;
    readonly restoreFollowUpDraft: (snapshot: PlanFollowUpComposerSnapshot) => void;
    /** False when the provider rejects the text, for example a length limit. */
    readonly validateProviderInput: (text: string) => boolean;
  };
  readonly threadCommands: {
    readonly controlGoal: (action: "pause" | "clear") => Promise<unknown>;
    readonly requestGoal: (request: {
      readonly action: "start" | "resume" | "show";
      readonly condition: string;
      readonly threadId: ThreadId;
    }) => void;
    readonly advancePendingUserInput: () => void;
    readonly editQueuedRun: (input: {
      readonly threadId: ThreadId;
      readonly runId: RunId;
      readonly text: string;
      readonly edit: {
        readonly messageId: MessageId;
        readonly attachments: ReadonlyArray<ChatAttachment>;
        readonly context: OrchestrationMessageContext;
      };
    }) => Promise<{ readonly _tag: "Success" | "Failure" }>;
    readonly uploadFeedback: (
      command: NonNullable<ReturnType<typeof parseCodexFeedbackCommand>>,
    ) => Promise<FeedbackUploadResult>;
    readonly recordFeedbackSubmission: (submission: FeedbackSubmission) => void;
    readonly submitPlanFollowUp: (input: {
      readonly text: string;
      readonly context: MessageContext;
      readonly interactionMode: "default" | "plan";
    }) => Promise<boolean>;
    readonly setInteractionMode: (
      mode: NonNullable<ReturnType<typeof parseStandaloneComposerSlashCommand>>,
    ) => void;
  };
  readonly uploads: {
    /** Upload the files of a queued edit. Throws a readable error. */
    readonly uploadQueuedEditFiles: (
      files: ReadonlyArray<ComposerFileAttachment>,
    ) => Promise<ReadonlyArray<ChatAttachment>>;
  };
  readonly feedback: {
    readonly toast: (toast: Toast) => void;
    readonly threadError: (threadId: ThreadId, message: string | null) => void;
    /** A rotating id, so repeated offline sends stack a short trail of toasts. */
    readonly nextEnvironmentUnavailableToastId: () => string;
  };
  readonly navigation: {
    /** False when the usage limits view could not open. */
    readonly openUsageLimits: () => boolean;
    readonly openStuckReport: () => void;
    readonly startNewThreadInProject: () => void;
  };
  readonly liveState: {
    readonly readSendContext: () => ComposerSendContext | undefined;
    /** True while the chat that sent is still the one on screen. */
    readonly isSendingChatActive: () => boolean;
    readonly isQueuedEditSaving: () => boolean;
    readonly beginQueuedEditSave: () => void;
    readonly endQueuedEditSave: () => void;
    readonly setFeedbackUploadInFlight: (inFlight: boolean) => void;
  };
}

/** `continue`: the caller starts the turn. `handled`: this module finished the send. */
export type TurnSubmissionResult =
  | { readonly _tag: "handled" }
  | {
      readonly _tag: "continue";
      readonly sendContext: ComposerSendContext;
      readonly draft: PreparedDraft;
      readonly threadId: ThreadId;
      readonly baseBranchForWorktree: string | null;
    };

const handled: TurnSubmissionResult = { _tag: "handled" };

const annotationAttachedToast = () =>
  stackedThreadToast({
    type: "info",
    title: "Annotation attached to draft",
    description: "Sending is unavailable right now. Finish the current action, then send.",
  });

export function createTurnSubmitter(ports: TurnSubmissionPorts) {
  const { drafts, threadCommands, uploads, feedback, navigation, liveState } = ports;

  const saveQueuedEdit = async (
    run: EditingQueuedRun,
    draft: PreparedDraft,
    sendContext: ComposerSendContext,
  ): Promise<void> => {
    liveState.beginQueuedEditSave();
    const editText = draft.promptForSend.trim();
    const newEditImages = [...draft.composerImages];
    const newEditFiles = [...sendContext.files];
    const newEditAttachments = [...newEditImages, ...newEditFiles];
    try {
      const attachments = await prepareQueuedEditAttachments({
        existingAttachments: run.existingAttachments,
        images: newEditImages,
        files: newEditFiles,
        readImage: readFileAsDataUrl,
        uploadFiles: uploads.uploadQueuedEditFiles,
      });
      const result = await threadCommands.editQueuedRun({
        threadId: run.threadId,
        runId: run.runId,
        text: editText.length === 0 ? ATTACHMENT_ONLY_BOOTSTRAP_PROMPT : editText,
        edit: {
          messageId: run.messageId,
          attachments,
          context: {
            version: 1,
            records: [
              ...new Map(
                [
                  ...(run.context?.records ?? []).filter(
                    (record) =>
                      !("attachmentId" in record) ||
                      run.existingAttachments.some(
                        (attachment) => attachment.id === record.attachmentId,
                      ),
                  ),
                  ...(buildMessageContext({
                    terminalContexts: sendContext.terminalContexts.filter(
                      (context) => context.text.trim().length > 0,
                    ),
                    reviewComments: sendContext.reviewComments,
                    previewAnnotations: draft.composerPreviewAnnotations,
                    threadContexts: sendContext.threadContexts,
                    attachments: newEditAttachments.map((attachment, index) => ({
                      attachment,
                      attachmentId:
                        attachments[run.existingAttachments.length + index]?.id ?? attachment.id,
                    })),
                  })?.records ?? []),
                ].map((record) => [record.contextId, record] as const),
              ).values(),
            ],
          },
        },
      });
      if (result._tag === "Failure") {
        feedback.threadError(run.threadId, "Could not save the edited waiting message.");
        return;
      }
      feedback.threadError(run.threadId, null);
      drafts.releaseAttachments(newEditAttachments);
      drafts.finishQueuedEdit(run.runId);
    } catch (error) {
      feedback.threadError(
        run.threadId,
        error instanceof Error ? error.message : "Could not save the edited waiting message.",
      );
    } finally {
      liveState.endQueuedEditSave();
    }
  };

  const submit = async (snapshot: TurnSubmissionSnapshot): Promise<TurnSubmissionResult> => {
    const hasDirectAnnotation = snapshot.directAnnotation !== null;
    const typedCommandAllowed = !hasDirectAnnotation && !snapshot.hasNonPromptContent;
    const notifyAnnotationAttached = () => {
      if (hasDirectAnnotation) feedback.toast(annotationAttachedToast());
    };

    const goalCommand = typedCommandAllowed ? parseThreadGoalCommand(snapshot.prompt) : null;
    if (
      goalCommand &&
      snapshot.activeThreadId !== null &&
      snapshot.isServerThread &&
      snapshot.canOperate
    ) {
      if (goalCommand.action === "pause" || goalCommand.action === "clear") {
        await threadCommands.controlGoal(goalCommand.action);
      } else {
        threadCommands.requestGoal({
          action: goalCommand.action,
          condition: goalCommand.action === "start" ? goalCommand.condition : "",
          threadId: snapshot.activeThreadId,
        });
      }
      drafts.clearPrompt();
      return handled;
    }

    if (
      snapshot.usageLimitsAvailable &&
      typedCommandAllowed &&
      isUsageLimitsCommand(snapshot.prompt)
    ) {
      if (navigation.openUsageLimits()) drafts.clearPrompt();
      return handled;
    }

    // The spoken phrase "Leonidas, I'm stuck" (by mic or Scribe) opens the report preview.
    if (snapshot.stuckReportEnabled && typedCommandAllowed && isStuckPhrase(snapshot.prompt)) {
      navigation.openStuckReport();
      drafts.clearPrompt();
      return handled;
    }

    if (
      !snapshot.canOperate ||
      snapshot.activeThreadId === null ||
      Object.values(snapshot.busy).some(Boolean)
    ) {
      notifyAnnotationAttached();
      return handled;
    }
    const threadId = snapshot.activeThreadId;

    if (snapshot.loadBalancing.needed) {
      const { pending } = snapshot.loadBalancing;
      feedback.toast({
        type: "warning",
        title: pending
          ? "Checking the resources of your computers"
          : "Choose a computer to continue",
        description: pending
          ? "Resource checks are still running. You can choose a computer in the message box."
          : "No computer has free resources. Choose a computer in the message box.",
      });
      return handled;
    }

    if (snapshot.environmentUnavailable) {
      feedback.toast({
        ...stackedThreadToast({
          type: "warning",
          title: "Not connected: message not sent",
          description: "Reconnecting to the computer. Try again once it is connected.",
        }),
        id: feedback.nextEnvironmentUnavailableToastId(),
      });
      return handled;
    }

    const sendContext = liveState.readSendContext();
    if (snapshot.hasPendingUserInput && sendContext?.answeringPendingUserInput !== false) {
      if (hasDirectAnnotation) notifyAnnotationAttached();
      else threadCommands.advancePendingUserInput();
      return handled;
    }
    if (!sendContext?.providerAvailable) {
      notifyAnnotationAttached();
      return handled;
    }

    const multipleModelSelections = sendContext.multipleModelSelections;
    if (multipleModelSelections !== null) {
      const { multiModel } = snapshot;
      if (!multiModel.worktreeBootstrapSupported) {
        feedback.threadError(
          threadId,
          "Update Leonidas on this computer before you start many models.",
        );
        return handled;
      }
      if (
        !multiModel.isLocalDraftThread ||
        !multiModel.isGitRepo ||
        !snapshot.activeThreadBranch ||
        multipleModelSelections.length === 0
      ) {
        feedback.toast(
          stackedThreadToast({
            type: "warning",
            title: "Choose models and a base branch",
            description:
              "Multiple models need a new chat in a Git project. Each gets its own separate copy.",
          }),
        );
        return handled;
      }
    }

    const draft = prepareDraft(snapshot, sendContext);
    const { composerImages, composerPreviewAnnotations, trimmedPrompt } = draft;
    const { files, reviewComments, threadContexts } = sendContext;

    const run = snapshot.editingQueuedRun;
    if (run !== null) {
      // Edit mode repurposes the composer: sending saves the queued message
      // in place instead of dispatching a new turn.
      if (liveState.isQueuedEditSaving()) return handled;
      const newAttachmentCount = composerImages.length + files.length;
      if (
        run.existingAttachments.length + newAttachmentCount >
        PROVIDER_SEND_TURN_MAX_ATTACHMENTS
      ) {
        feedback.threadError(
          run.threadId,
          `A message can have at most ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} attachments.`,
        );
        return handled;
      }
      const isEmptyEdit =
        draft.promptForSend.trim().length === 0 &&
        run.existingAttachments.length === 0 &&
        newAttachmentCount === 0;
      if (!isEmptyEdit) await saveQueuedEdit(run, draft, sendContext);
      return handled;
    }

    const onlyText =
      composerImages.length === 0 &&
      files.length === 0 &&
      draft.sendableTerminalContexts.length === 0 &&
      composerPreviewAnnotations.length === 0 &&
      reviewComments.length === 0 &&
      threadContexts.length === 0;

    const feedbackCommand =
      sendContext.selectedProvider === "codex" && onlyText
        ? parseCodexFeedbackCommand(trimmedPrompt)
        : null;
    if (feedbackCommand && multipleModelSelections === null) {
      if (!snapshot.isServerThread || !snapshot.hasProviderThread) {
        feedback.toast(
          stackedThreadToast({
            type: "warning",
            title: "Start a Codex chat first",
            description: "Send a message before you submit feedback.",
          }),
        );
        return handled;
      }
      liveState.setFeedbackUploadInFlight(true);
      await submitCodexFeedback({
        submission: {
          id: newMessageId(),
          command: trimmedPrompt,
          createdAt: new Date().toISOString(),
        },
        clearDraft: drafts.clearDraft,
        onUpdate: threadCommands.recordFeedbackSubmission,
        upload: () => threadCommands.uploadFeedback(feedbackCommand),
      }).finally(() => liveState.setFeedbackUploadInFlight(false));
      return handled;
    }

    if (
      !hasDirectAnnotation &&
      sendContext.interactionModeEnabled &&
      snapshot.planFollowUp !== null &&
      composerImages.length === 0 &&
      files.length === 0
    ) {
      const followUp = resolvePlanFollowUpSubmission({
        draftText: draft.promptForSend,
        planMarkdown: snapshot.planFollowUp.planMarkdown,
      });
      const outgoingFollowUpText = formatOutgoingPrompt({
        provider: sendContext.selectedProvider,
        model: sendContext.selectedModel,
        models: sendContext.selectedProviderModels,
        effort: sendContext.selectedPromptEffort,
        text: followUp.text.trim(),
      });
      if (!drafts.validateProviderInput(outgoingFollowUpText)) return handled;
      // The composer is cleared before the send resolves, so hold everything it carried: a
      // transient failure must give the prose and its context back, as the ordinary send does.
      // Snapshot exactly what was sent, copied, so later mutations cannot alias the backup.
      const backup: PlanFollowUpComposerSnapshot = {
        prompt: snapshot.prompt,
        terminalContexts: [...draft.sendableTerminalContexts],
        reviewComments: [...reviewComments],
        previewAnnotations: [...composerPreviewAnnotations],
        threadContexts: [...threadContexts],
      };
      drafts.clearDraft();
      const followUpSent = await threadCommands.submitPlanFollowUp({
        text: followUp.text,
        context: buildMessageContext({
          terminalContexts: draft.sendableTerminalContexts,
          reviewComments,
          previewAnnotations: composerPreviewAnnotations,
          threadContexts,
        }),
        interactionMode: followUp.interactionMode,
      });
      if (!followUpSent) {
        drafts.restoreFollowUpDraft(backup);
      } else if (snapshot.submissionIntent === "background" && liveState.isSendingChatActive()) {
        navigation.startNewThreadInProject();
      }
      return handled;
    }

    // Providers without the legacy toggle receive their native commands unchanged.
    const standaloneSlashCommand =
      sendContext.interactionModeEnabled && onlyText
        ? parseStandaloneComposerSlashCommand(trimmedPrompt)
        : null;
    if (standaloneSlashCommand && multipleModelSelections === null) {
      threadCommands.setInteractionMode(standaloneSlashCommand);
      drafts.clearDraft();
      return handled;
    }

    if (!draft.hasSendableContent) {
      if (draft.expiredTerminalContextCount > 0) {
        const toastCopy = buildExpiredTerminalContextToastCopy(
          draft.expiredTerminalContextCount,
          "empty",
        );
        feedback.toast(
          stackedThreadToast({
            type: "warning",
            title: toastCopy.title,
            description: toastCopy.description,
          }),
        );
      }
      return handled;
    }

    if (!snapshot.hasActiveProject) {
      feedback.toast(
        stackedThreadToast({
          type: "warning",
          title: "Choose a project first",
          description: "This draft no longer points to an available project.",
        }),
      );
      return handled;
    }

    const { worktree } = snapshot;
    const isFirstMessage =
      !worktree.sendQueuesBehindSetup &&
      (!snapshot.isServerThread || worktree.activeMessageCount === 0);
    // In worktree mode, require an explicit base branch so we don't silently
    // fall back to local execution when branch selection is missing.
    const shouldCreateWorktree =
      isFirstMessage && worktree.envMode === "worktree" && !worktree.existingWorktreePath;
    if (shouldCreateWorktree && !snapshot.activeThreadBranch) {
      feedback.threadError(
        threadId,
        "Select a base branch before sending in New separate copy mode.",
      );
      return handled;
    }

    return {
      _tag: "continue",
      sendContext,
      draft,
      threadId,
      baseBranchForWorktree: shouldCreateWorktree ? snapshot.activeThreadBranch : null,
    };
  };

  return { submit };
}

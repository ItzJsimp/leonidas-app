import {
  wasBootstrapThreadDeleted,
  wasBootstrapThreadNotCreated,
} from "@t3tools/client-runtime/errors";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";
import { serializeLegacyContextMessage } from "@t3tools/shared/composerContextLegacySend";
import { newMessageId, newThreadId } from "~/lib/utils";
import { userErrorToastFields } from "~/lib/userErrorToast";
import type { buildMessageContext } from "../../lib/composerContextRecords";
import { stackedThreadToast } from "../ui/toastHelpers";
import type { CommandFailure, StartTurnInput } from "./turnDispatch";

/**
 * The multi-model (arena) send: one background chat per chosen model, each in its own
 * worktree. Part of the turn submission module (slice 4). The ports are the same roles
 * as the single-model path.
 */
type MessageContext = ReturnType<typeof buildMessageContext>;
type StartResult = { readonly _tag: "Success" } | CommandFailure;
type Toast = ReturnType<typeof stackedThreadToast>;
type TurnAttachments = StartTurnInput extends { message: { attachments: infer A } } ? A : never;

export interface ArenaTarget {
  readonly selection: ModelSelection;
  readonly text: string;
  readonly interactionMode: ProviderInteractionMode;
}

export interface ArenaPorts {
  readonly startTurn: (input: StartTurnInput) => Promise<StartResult>;
  readonly readLiveFileBlockReason: () => string | null;
  readonly supportsInlineMessageContext: () => boolean;
  readonly drafts: {
    /** Empties the composer once the attachments are ready. */
    readonly clearDraft: () => void;
    /** The draft object itself: a changed identity means the user typed again. */
    readonly readDraft: () => unknown;
    /** Writes the sent draft back into the composer. */
    readonly restoreDraft: () => void;
    readonly composerAvailable: () => boolean;
    readonly releaseAttachments: () => void;
    /** True when the draft still exists and its composer is empty. */
    readonly canRestoreFromToast: () => boolean;
    readonly openDraft: () => void;
  };
  readonly liveState: {
    readonly readSelections: () => unknown;
    readonly setSelections: (selections: ModelSelection[]) => void;
    readonly isSendingChatActive: () => boolean;
    readonly isCurrentSendGeneration: () => boolean;
    /** Frees the send lock and the local dispatch state. */
    readonly releaseSend: () => void;
  };
  /** Chats whose start request may have reached the server. Keyed by thread and model. */
  readonly uncertainSubmissions: Map<string, ThreadId>;
  readonly feedback: {
    readonly threadError: (message: string | null) => void;
    readonly toastAdd: (toast: Toast) => string;
    readonly toastClose: (id: string) => void;
    readonly toastUpdate: (id: string, update: { description: string }) => void;
    /** Resolves false when the user declines. Returns nothing when no dialog is available. */
    readonly confirm: (message: string) => Promise<boolean> | undefined;
  };
  readonly navigation: { readonly openThread: (threadId: ThreadId) => void };
}

export interface ArenaInput {
  readonly environmentId: EnvironmentId;
  readonly routeThreadKey: string;
  readonly selections: ReadonlyArray<ModelSelection>;
  readonly targets: ReadonlyArray<ArenaTarget>;
  readonly createdAt: string;
  readonly title: string;
  readonly runtimeMode: RuntimeMode;
  readonly projectId: string;
  readonly projectCwd: string;
  readonly activeThreadBranch: string | null;
  readonly startFromOrigin: boolean;
  readonly replyStyleField: Record<string, unknown>;
  readonly turnAttachmentsPromise: Promise<TurnAttachments>;
  readonly localAttachmentIds: ReadonlyArray<string>;
  readonly turnUsesAttachmentUploads: boolean;
  readonly buildOutgoingMessageContext: (ids: ReadonlyArray<string>) => MessageContext;
  readonly threadId: ThreadId;
}

export async function submitArena(ports: ArenaPorts, input: ArenaInput): Promise<void> {
  const { drafts, liveState, feedback } = ports;
  const failedSelections: ModelSelection[] = [];
  let clearedDraft = false;
  let releasedComposer = false;
  let canRestoreDraft = () => false;
  let startedCount = 0;
  try {
    const attachments = await input.turnAttachmentsPromise;
    const fileBlockReason = ports.readLiveFileBlockReason();
    if (fileBlockReason !== null) throw new Error(fileBlockReason);
    const context = input.buildOutgoingMessageContext(
      attachments.map((attachment, index) =>
        "id" in attachment && attachment.id !== undefined
          ? attachment.id
          : input.localAttachmentIds[index]!,
      ),
    );
    drafts.clearDraft();
    clearedDraft = true;
    const clearedDraftSnapshot = drafts.readDraft();
    const submittedSelections = liveState.readSelections();
    canRestoreDraft = () =>
      liveState.isSendingChatActive() &&
      liveState.isCurrentSendGeneration() &&
      drafts.readDraft() === clearedDraftSnapshot &&
      liveState.readSelections() === submittedSelections;
    feedback.threadError(null);
    const starts = Promise.all(
      input.targets.map(async (target) => {
        const retryKey = JSON.stringify([
          input.routeThreadKey,
          target.selection.instanceId,
          target.selection.model,
        ]);
        const uncertainThreadId = ports.uncertainSubmissions.get(retryKey);
        const targetThreadId = uncertainThreadId ?? newThreadId();
        let requestMayHaveStarted = false;
        try {
          if (uncertainThreadId) {
            throw new Error(
              "The previous request may have started. Open its chat to check before sending again.",
            );
          }
          const inline = ports.supportsInlineMessageContext();
          requestMayHaveStarted = true;
          const result = await ports.startTurn({
            threadId: targetThreadId,
            message: {
              messageId: newMessageId(),
              role: "user",
              text:
                context && !inline
                  ? serializeLegacyContextMessage({ text: target.text, records: context.records })
                  : target.text,
              attachments,
              ...(context && inline ? { context } : {}),
            },
            modelSelection: target.selection,
            titleSeed: input.title,
            runtimeMode: input.runtimeMode,
            interactionMode: target.interactionMode,
            bootstrap: {
              createThread: {
                projectId: input.projectId,
                title: input.title,
                modelSelection: target.selection,
                runtimeMode: input.runtimeMode,
                interactionMode: target.interactionMode,
                branch: input.activeThreadBranch,
                worktreePath: null,
                createdAt: input.createdAt,
                ...input.replyStyleField,
              },
              prepareWorktree: {
                projectCwd: input.projectCwd,
                baseBranch: input.activeThreadBranch!,
                requireWorktree: true,
                ...(input.startFromOrigin ? { startFromOrigin: true } : {}),
              },
              runSetupScript: true,
            },
            createdAt: input.createdAt,
          } as StartTurnInput);
          if (result._tag === "Failure") {
            const error = squashAtomCommandFailure(result);
            if (wasBootstrapThreadDeleted(error) || wasBootstrapThreadNotCreated(error)) {
              requestMayHaveStarted = false;
            }
            throw error;
          }
          startedCount += 1;
        } catch (error) {
          if (requestMayHaveStarted && !ports.uncertainSubmissions.has(retryKey)) {
            ports.uncertainSubmissions.set(retryKey, targetThreadId);
          }
          failedSelections.push(target.selection);
          const retainedThreadId = ports.uncertainSubmissions.get(retryKey);
          const failureToastId: string = feedback.toastAdd(
            stackedThreadToast({
              type: "error",
              title: `Could not start ${target.selection.model}`,
              ...userErrorToastFields(error),
              ...(retainedThreadId
                ? {
                    timeout: 0,
                    data: {
                      secondaryActionProps: {
                        children: "Allow retry",
                        onClick: () => {
                          void feedback
                            .confirm(
                              "The previous request may already be running. Check its chat first. Allow another send that could create a duplicate chat?",
                            )
                            ?.then(
                              (confirmed) => {
                                if (
                                  confirmed &&
                                  ports.uncertainSubmissions.get(retryKey) === retainedThreadId
                                ) {
                                  ports.uncertainSubmissions.delete(retryKey);
                                  feedback.toastClose(failureToastId);
                                }
                              },
                              () => undefined,
                            );
                        },
                      },
                    },
                    actionProps: {
                      children: "Open chat",
                      onClick: () => ports.navigation.openThread(retainedThreadId),
                    },
                  }
                : {}),
            }),
          );
        }
      }),
    );
    // Each request now owns its background thread. The original draft is
    // ready for another prompt while checkout and setup scripts finish.
    liveState.releaseSend();
    releasedComposer = true;
    await starts;
    if (startedCount > 0) {
      feedback.toastAdd(
        stackedThreadToast({
          type: "success",
          title: `Started ${startedCount} ${startedCount === 1 ? "chat" : "chats"} in the background`,
        }),
      );
    }
    if (failedSelections.length === 0 && input.turnUsesAttachmentUploads) {
      drafts.releaseAttachments();
    }
  } catch (error) {
    failedSelections.push(...input.selections);
    feedback.threadError(error instanceof Error ? error.message : "Could not send messages.");
  } finally {
    const restoreFailedDraft = () => {
      liveState.setSelections(failedSelections);
      if (clearedDraft) drafts.restoreDraft();
    };
    if (failedSelections.length > 0) {
      if (canRestoreDraft() && drafts.composerAvailable()) {
        restoreFailedDraft();
      } else if (clearedDraft) {
        const recoveryToastId: string = feedback.toastAdd(
          stackedThreadToast({
            type: "error",
            title: "A background message could not be sent",
            description:
              "Your newer draft is unchanged. Restore the failed message when the message box is empty.",
            timeout: 0,
            actionProps: {
              children: "Restore message",
              onClick: () => {
                if (!drafts.canRestoreFromToast()) {
                  feedback.toastUpdate(recoveryToastId, {
                    description:
                      "Return to the original draft and send or clear its current message before restoring.",
                  });
                  return;
                }
                restoreFailedDraft();
                drafts.openDraft();
                feedback.toastClose(recoveryToastId);
              },
            },
          }),
        );
      }
    }
    if (!releasedComposer) liveState.releaseSend();
  }
}

import type {
  EnvironmentId,
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ThreadId,
  ScopedThreadRef,
} from "@t3tools/contracts";
import type { AtomCommand, AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import type { ComposerSubmissionIntent } from "../../composer-logic";
import { newMessageId } from "~/lib/utils";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import { serializeLegacyContextMessage } from "@t3tools/shared/composerContextLegacySend";
import type { threadEnvironment } from "../../state/threads";
import type { buildMessageContext } from "../../lib/composerContextRecords";

/**
 * The dispatch half of the normal turn path: save settings, wait for attachments,
 * compact a stale session, then start the turn. Part of the turn submission module
 * (slice 3, stage C). Failure recovery lives in `turnFailure.ts`.
 */
type StartTurnWire =
  typeof threadEnvironment.startTurn extends AtomCommand<infer W, infer _A, infer _E> ? W : never;
export type StartTurnInput = StartTurnWire extends { readonly input: infer I } ? I : never;
type TurnAttachments = StartTurnInput extends { message: { attachments: infer A } } ? A : never;
type CommandResult = AtomCommandResult<unknown, unknown>;
export type CommandFailure = Extract<CommandResult, { readonly _tag: "Failure" }>;
type MessageContext = ReturnType<typeof buildMessageContext>;

export interface TurnDispatchPorts {
  readonly persistThreadSettings: (input: {
    readonly threadId: ThreadId;
    readonly createdAt: string;
    readonly branch?: string;
    readonly runtimeMode: RuntimeMode;
    readonly interactionMode: ProviderInteractionMode;
  }) => Promise<CommandResult>;
  readonly startTurn: (input: StartTurnInput) => Promise<CommandResult>;
  /** Read at dispatch time: uploads can span a server reconnect that changes it. */
  readonly readLiveFileBlockReason: () => string | null;
  readonly supportsInlineMessageContext: () => boolean;
  /** Runs once the server accepted the turn. */
  readonly onTurnStarted: () => void;
  readonly background: {
    readonly begin: (ref: ScopedThreadRef) => void;
    readonly markPromoted: (ref: ScopedThreadRef) => void;
    /** Opens a fresh draft beside the sent one. False when none opened. */
    readonly openNewDraft: () => Promise<boolean>;
    readonly clear: (ref: ScopedThreadRef) => void;
    readonly finalize: (ref: ScopedThreadRef) => void;
    readonly notifyStarted: (ref: ScopedThreadRef) => void;
    readonly notifyOpenFailed: (error: unknown) => void;
    /** An existing thread keeps running; open a fresh composer like a draft does. */
    readonly openFreshComposer: () => void;
    readonly isSendingChatActive: () => boolean;
  };
}

export interface TurnDispatchInput {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly messageId: string;
  readonly createdAt: string;
  readonly title: string;
  readonly outgoingMessageText: string;
  readonly turnDispatchMode: StartTurnInput["dispatchMode"];
  readonly compactBeforeSend: boolean;
  readonly isServerThread: boolean;
  readonly isLocalDraftThread: boolean;
  readonly submissionIntent: ComposerSubmissionIntent;
  readonly baseBranchForWorktree: string | null;
  readonly startFromOrigin: boolean;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly modelSelection: ModelSelection;
  readonly threadCreateModelSelection: ModelSelection;
  /** Set when the local checkout moved to another branch since the thread began. */
  readonly localCheckoutBranch: string | null;
  readonly activeThreadBranch: string | null;
  readonly worktreePath: string | null;
  readonly threadCreatedAt: string;
  readonly projectId: string;
  readonly projectCwd: string;
  readonly replyStyleField: Record<string, unknown>;
  readonly turnAttachmentsPromise: Promise<TurnAttachments>;
  readonly localAttachmentIds: ReadonlyArray<string>;
  readonly buildOutgoingMessageContext: (ids: ReadonlyArray<string>) => MessageContext;
  readonly backgroundThreadRef: ScopedThreadRef | null;
}

export interface TurnDispatchOutcome {
  readonly failure: CommandFailure | null;
  readonly backgroundDraftOpened: boolean;
  readonly turnStartSucceeded: boolean;
}

export async function dispatchTurn(
  ports: TurnDispatchPorts,
  input: TurnDispatchInput,
): Promise<TurnDispatchOutcome> {
  let failure: CommandFailure | null = null;

  if (input.isServerThread) {
    const settingsResult = await ports.persistThreadSettings({
      threadId: input.threadId,
      createdAt: input.createdAt,
      ...(input.localCheckoutBranch ? { branch: input.localCheckoutBranch } : {}),
      runtimeMode: input.runtimeMode,
      interactionMode: input.interactionMode,
    });
    if (settingsResult._tag === "Failure") failure = settingsResult;
  }

  const attachmentsResult = await settlePromise(async () => {
    const attachments = await input.turnAttachmentsPromise;
    const blockReason = ports.readLiveFileBlockReason();
    if (blockReason !== null) throw new Error(blockReason);
    return attachments;
  });
  if (failure === null && attachmentsResult._tag === "Failure") failure = attachmentsResult;

  if (failure === null && input.compactBeforeSend) {
    const compactResult = await ports.startTurn({
      threadId: input.threadId,
      message: { messageId: newMessageId(), role: "user", text: "/compact", attachments: [] },
      modelSelection: input.modelSelection,
      runtimeMode: input.runtimeMode,
      interactionMode: input.interactionMode,
    } as StartTurnInput);
    if (compactResult._tag === "Failure") failure = compactResult;
  }

  let backgroundDraftOpened = false;
  let turnStartSucceeded = false;
  if (failure !== null || attachmentsResult._tag !== "Success") {
    return { failure, backgroundDraftOpened, turnStartSucceeded };
  }

  const bootstrap =
    input.isLocalDraftThread || input.baseBranchForWorktree
      ? {
          ...(input.isLocalDraftThread
            ? {
                createThread: {
                  projectId: input.projectId,
                  title: input.title,
                  modelSelection: input.threadCreateModelSelection,
                  runtimeMode: input.runtimeMode,
                  interactionMode: input.interactionMode,
                  branch: input.activeThreadBranch,
                  worktreePath: input.worktreePath,
                  createdAt: input.threadCreatedAt,
                  ...input.replyStyleField,
                },
              }
            : {}),
          ...(input.baseBranchForWorktree
            ? {
                prepareWorktree: {
                  projectCwd: input.projectCwd,
                  baseBranch: input.baseBranchForWorktree,
                  ...(input.startFromOrigin ? { startFromOrigin: true } : {}),
                },
                runSetupScript: true,
              }
            : {}),
        }
      : undefined;
  const { backgroundThreadRef } = input;
  if (backgroundThreadRef) ports.background.begin(backgroundThreadRef);
  const context = input.buildOutgoingMessageContext(
    attachmentsResult.value.map((attachment, index) =>
      "id" in attachment && attachment.id !== undefined
        ? attachment.id
        : input.localAttachmentIds[index]!,
    ),
  );
  const startPromise = ports.startTurn({
    threadId: input.threadId,
    message: {
      messageId: input.messageId,
      role: "user",
      text: input.outgoingMessageText,
      attachments: attachmentsResult.value,
      ...(context === undefined
        ? {}
        : // Read the capability at dispatch time. Servers from before inline context drop
          // the records, so their turns carry the payload the legacy way.
          ports.supportsInlineMessageContext()
          ? { context }
          : {
              text: serializeLegacyContextMessage({
                text: input.outgoingMessageText,
                records: context.records,
              }),
            }),
    },
    modelSelection: input.modelSelection,
    titleSeed: input.title,
    runtimeMode: input.runtimeMode,
    interactionMode: input.interactionMode,
    dispatchMode: input.turnDispatchMode,
    ...(bootstrap ? { bootstrap } : {}),
    createdAt: input.createdAt,
  } as StartTurnInput);
  if (backgroundThreadRef) {
    ports.background.markPromoted(backgroundThreadRef);
    try {
      backgroundDraftOpened = await ports.background.openNewDraft();
    } catch (error) {
      ports.background.clear(backgroundThreadRef);
      ports.background.notifyOpenFailed(error);
    }
  }
  const startResult = await startPromise;
  if (startResult._tag === "Failure") {
    failure = startResult;
    return { failure, backgroundDraftOpened, turnStartSucceeded };
  }
  turnStartSucceeded = true;
  ports.onTurnStarted();
  if (backgroundThreadRef) {
    if (backgroundDraftOpened || !ports.background.isSendingChatActive()) {
      ports.background.finalize(backgroundThreadRef);
    } else {
      ports.background.clear(backgroundThreadRef);
    }
    if (backgroundDraftOpened) ports.background.notifyStarted(backgroundThreadRef);
  } else if (input.submissionIntent === "background" && ports.background.isSendingChatActive()) {
    ports.background.openFreshComposer();
  }
  return { failure, backgroundDraftOpened, turnStartSucceeded };
}

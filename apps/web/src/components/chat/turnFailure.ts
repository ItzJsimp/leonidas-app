import type { CommandFailure } from "./turnDispatch";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { wasBootstrapThreadDeleted } from "@t3tools/client-runtime/errors";

/**
 * What happens after a turn failed to start: give the draft back, drop the optimistic
 * message, and tell the user. Part of the turn submission module (slice 3, stage C).
 */
export interface TurnFailurePorts {
  /** True when the composer is still empty, so the draft can return without a clash. */
  readonly composerIsEmpty: (backgroundDraftOpened: boolean) => boolean;
  readonly removeOptimisticMessage: () => void;
  /** Writes the sent draft (prompt, chips, attachments) back into the composer. */
  readonly restoreDraft: () => void;
  /** Gives a background draft back, under this thread id. */
  readonly restoreBackgroundDraft: (threadId: string) => void;
  readonly clearBackgroundSubmission: () => void;
  readonly newThreadId: () => string;
  readonly threadError: (message: string) => void;
  readonly toastBackgroundFailed: (error: unknown) => void;
}

export interface TurnFailureInput {
  readonly failure: CommandFailure;
  readonly threadId: string;
  /** A background send from a draft that still exists. */
  readonly hasBackgroundDraft: boolean;
  readonly backgroundDraftOpened: boolean;
  /** An open draft the user can return to. */
  readonly hasDraftId: boolean;
}

export function handleTurnFailure(ports: TurnFailurePorts, input: TurnFailureInput): void {
  const { failure } = input;
  if (input.hasBackgroundDraft) {
    ports.restoreBackgroundDraft(
      wasBootstrapThreadDeleted(squashAtomCommandFailure(failure))
        ? ports.newThreadId()
        : input.threadId,
    );
    ports.clearBackgroundSubmission();
  }
  if (ports.composerIsEmpty(input.backgroundDraftOpened)) {
    ports.removeOptimisticMessage();
    ports.restoreDraft();
  }
  if (isAtomCommandInterrupted(failure)) return;
  const error = squashAtomCommandFailure(failure);
  ports.threadError(error instanceof Error ? error.message : "Could not send message.");
  if (input.backgroundDraftOpened && input.hasDraftId) ports.toastBackgroundFailed(error);
}

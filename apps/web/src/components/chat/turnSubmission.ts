import type { ThreadId } from "@t3tools/contracts";
import { parseThreadGoalCommand } from "@t3tools/shared/threadGoalCommand";
import { isUsageLimitsCommand } from "@t3tools/shared/usageLimits";
import { isStuckPhrase } from "~/lib/community/stuckReport";
import type { toastManager } from "../ui/toast";
import { stackedThreadToast } from "../ui/toastHelpers";
import type { ChatComposerHandle } from "./ChatComposer";

/**
 * The turn submission module: what happens when the user presses Send.
 * Slice 1 of 4 holds the guards that run before the draft is read.
 * Design: logs/grill-sessions/2026-11-25-turn-submission-module.md.
 */

export type ComposerSendContext = ReturnType<ChatComposerHandle["getSendContext"]>;
type Toast = Parameters<typeof toastManager.add>[0];

/** State read once, at the moment the user pressed Send. */
export interface TurnSubmissionSnapshot {
  readonly prompt: string;
  readonly hasDirectAnnotation: boolean;
  /** Attachments or contexts mean the user sends a prompt, not a typed command. */
  readonly hasNonPromptContent: boolean;
  readonly activeThreadId: ThreadId | null;
  readonly isServerThread: boolean;
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
    readonly hasBranch: boolean;
  };
}

export interface TurnSubmissionPorts {
  readonly drafts: {
    /** Empty the prompt and reset the composer cursor. */
    readonly clearPrompt: () => void;
  };
  readonly threadCommands: {
    readonly controlGoal: (action: "pause" | "clear") => Promise<unknown>;
    readonly requestGoal: (request: {
      readonly action: "start" | "resume" | "show";
      readonly condition: string;
      readonly threadId: ThreadId;
    }) => void;
    readonly advancePendingUserInput: () => void;
  };
  readonly feedback: {
    readonly toast: (toast: Toast) => void;
    readonly threadError: (threadId: ThreadId, message: string) => void;
    /** A rotating id, so repeated offline sends stack a short trail of toasts. */
    readonly nextEnvironmentUnavailableToastId: () => string;
  };
  readonly navigation: {
    /** False when the usage limits view could not open. */
    readonly openUsageLimits: () => boolean;
    readonly openStuckReport: () => void;
  };
  readonly liveState: {
    readonly readSendContext: () => ComposerSendContext | undefined;
  };
}

/** `continue`: the caller sends the draft. `handled`: this module finished the send. */
export type TurnSubmissionResult =
  | { readonly _tag: "handled" }
  | { readonly _tag: "continue"; readonly sendContext: ComposerSendContext };

const handled: TurnSubmissionResult = { _tag: "handled" };

const annotationAttachedToast = () =>
  stackedThreadToast({
    type: "info",
    title: "Annotation attached to draft",
    description: "Sending is unavailable right now. Finish the current action, then send.",
  });

export function createTurnSubmitter(ports: TurnSubmissionPorts) {
  const { drafts, threadCommands, feedback, navigation, liveState } = ports;

  const submit = async (snapshot: TurnSubmissionSnapshot): Promise<TurnSubmissionResult> => {
    const typedCommandAllowed = !snapshot.hasDirectAnnotation && !snapshot.hasNonPromptContent;
    const notifyAnnotationAttached = () => {
      if (snapshot.hasDirectAnnotation) feedback.toast(annotationAttachedToast());
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
      if (snapshot.hasDirectAnnotation) notifyAnnotationAttached();
      else threadCommands.advancePendingUserInput();
      return handled;
    }
    if (!sendContext?.providerAvailable) {
      notifyAnnotationAttached();
      return handled;
    }

    if (sendContext.multipleModelSelections !== null) {
      const { multiModel } = snapshot;
      if (!multiModel.worktreeBootstrapSupported) {
        feedback.threadError(
          snapshot.activeThreadId,
          "Update Leonidas on this computer before you start many models.",
        );
        return handled;
      }
      if (
        !multiModel.isLocalDraftThread ||
        !multiModel.isGitRepo ||
        !multiModel.hasBranch ||
        sendContext.multipleModelSelections.length === 0
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

    return { _tag: "continue", sendContext };
  };

  return { submit };
}

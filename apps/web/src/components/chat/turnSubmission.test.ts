import { MessageId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  createTurnSubmitter,
  type ComposerSendContext,
  type EditingQueuedRun,
  type TurnSubmissionPorts,
  type TurnSubmissionSnapshot,
} from "./turnSubmission";

const threadId = ThreadId.make("thread-1");
const runId = RunId.make("run-1");

const snapshot = (overrides: Partial<TurnSubmissionSnapshot> = {}): TurnSubmissionSnapshot => ({
  prompt: "hello",
  directAnnotation: null,
  hasNonPromptContent: false,
  activeThreadId: threadId,
  isServerThread: true,
  hasProviderThread: true,
  hasActiveProject: true,
  canOperate: true,
  usageLimitsAvailable: true,
  stuckReportEnabled: true,
  busy: {
    sendBusyNotQueuable: false,
    connecting: false,
    revertingCheckpoint: false,
    settingsNotHydrated: false,
    threadDetailLoading: false,
    environmentChanging: false,
    sendInFlight: false,
    feedbackUploadInFlight: false,
  },
  loadBalancing: { needed: false, pending: false },
  environmentUnavailable: false,
  hasPendingUserInput: false,
  multiModel: { worktreeBootstrapSupported: true, isLocalDraftThread: true, isGitRepo: true },
  activeThreadBranch: "main",
  attachedSubagent: null,
  subagentNames: new Set(),
  editingQueuedRun: null,
  planFollowUp: null,
  submissionIntent: "foreground",
  worktree: {
    sendQueuesBehindSetup: false,
    activeMessageCount: 3,
    envMode: "local",
    existingWorktreePath: null,
  },
  ...overrides,
});

const sendContext = (overrides: Partial<ComposerSendContext> = {}) =>
  ({
    answeringPendingUserInput: false,
    providerAvailable: true,
    multipleModelSelections: null,
    images: [],
    files: [],
    terminalContexts: [],
    previewAnnotations: [],
    reviewComments: [],
    threadContexts: [],
    selectedProvider: "codex",
    selectedModel: null,
    selectedProviderModels: [],
    selectedPromptEffort: null,
    interactionModeEnabled: true,
    ...overrides,
  }) as unknown as ComposerSendContext;

const queuedRun: EditingQueuedRun = {
  threadId,
  runId,
  messageId: MessageId.make("message-1"),
  originalText: "old",
  existingAttachments: [],
};

/** In-memory ports that record every call by name. */
function fakePorts(context: ComposerSendContext | undefined = sendContext()) {
  const calls: Array<readonly [string, ...unknown[]]> = [];
  const record =
    (name: string, result?: unknown) =>
    (...args: unknown[]): never => {
      calls.push([name, ...args]);
      return result as never;
    };
  const state = {
    usageLimitsOpens: true,
    queuedEditSaving: false,
    editResult: "Success" as "Success" | "Failure",
    followUpSent: true,
    chatActive: true,
  };
  const ports: TurnSubmissionPorts = {
    drafts: {
      clearPrompt: record("clearPrompt"),
      clearDraft: record("clearDraft"),
      finishQueuedEdit: record("finishQueuedEdit"),
      releaseAttachments: record("releaseAttachments"),
      restoreFollowUpDraft: record("restoreFollowUpDraft"),
      validateProviderInput: () => true,
    },
    threadCommands: {
      controlGoal: async (action) => calls.push(["controlGoal", action]),
      requestGoal: record("requestGoal"),
      advancePendingUserInput: record("advancePendingUserInput"),
      editQueuedRun: async (input) => {
        calls.push(["editQueuedRun", input]);
        return { _tag: state.editResult };
      },
      uploadFeedback: async (command) => {
        calls.push(["uploadFeedback", command]);
        return { _tag: "Success", value: { feedbackId: "f-1" } } as never;
      },
      recordFeedbackSubmission: record("recordFeedbackSubmission"),
      submitPlanFollowUp: async (input) => {
        calls.push(["submitPlanFollowUp", input]);
        return state.followUpSent;
      },
      setInteractionMode: record("setInteractionMode"),
    },
    uploads: { uploadQueuedEditFiles: async () => [] },
    feedback: {
      toast: record("toast"),
      threadError: record("threadError"),
      nextEnvironmentUnavailableToastId: () => "offline-0",
    },
    navigation: {
      openUsageLimits: () => {
        calls.push(["openUsageLimits"]);
        return state.usageLimitsOpens;
      },
      openStuckReport: record("openStuckReport"),
      startNewThreadInProject: record("startNewThreadInProject"),
    },
    liveState: {
      readSendContext: () => context,
      isSendingChatActive: () => state.chatActive,
      isQueuedEditSaving: () => state.queuedEditSaving,
      beginQueuedEditSave: record("beginQueuedEditSave"),
      endQueuedEditSave: record("endQueuedEditSave"),
      setFeedbackUploadInFlight: record("setFeedbackUploadInFlight"),
    },
  };
  return {
    submit: createTurnSubmitter(ports).submit,
    calls,
    state,
    names: () => calls.map(([name]) => name),
    toastTitles: () =>
      calls.filter(([name]) => name === "toast").map(([, t]) => (t as { title: string }).title),
  };
}

describe("createTurnSubmitter guards", () => {
  it("continues with the prepared draft when no route applies", async () => {
    const context = sendContext();
    const fake = fakePorts(context);
    const result = await fake.submit(snapshot());
    expect(result).toMatchObject({
      _tag: "continue",
      sendContext: context,
      threadId,
      baseBranchForWorktree: null,
      draft: { promptForSend: "hello", trimmedPrompt: "hello", hasSendableContent: true },
    });
    expect(fake.calls).toEqual([]);
  });

  it("pauses a goal and clears the prompt", async () => {
    const fake = fakePorts();
    expect(await fake.submit(snapshot({ prompt: "/goal pause" }))).toEqual({ _tag: "handled" });
    expect(fake.names()).toEqual(["controlGoal", "clearPrompt"]);
  });

  it("opens the goal dialog with the condition for /goal start", async () => {
    const fake = fakePorts();
    await fake.submit(snapshot({ prompt: "/goal ship the release" }));
    expect(fake.calls[0]).toEqual([
      "requestGoal",
      { action: "start", condition: "ship the release", threadId },
    ]);
  });

  it("sends /goal as a prompt when the message has attachments", async () => {
    const fake = fakePorts();
    const result = await fake.submit(
      snapshot({ prompt: "/goal pause", hasNonPromptContent: true }),
    );
    expect(result._tag).toBe("continue");
  });

  it("keeps the prompt when the usage limits view cannot open", async () => {
    const fake = fakePorts();
    fake.state.usageLimitsOpens = false;
    expect(await fake.submit(snapshot({ prompt: "/usage-limits" }))).toEqual({ _tag: "handled" });
    expect(fake.names()).toEqual(["openUsageLimits"]);
  });

  it("opens the stuck report for the spoken phrase", async () => {
    const fake = fakePorts();
    await fake.submit(snapshot({ prompt: "Leonidas, I'm stuck" }));
    expect(fake.names()).toEqual(["openStuckReport", "clearPrompt"]);
  });

  it("stops a busy send and tells a direct annotation it was attached", async () => {
    const fake = fakePorts();
    const busy = { ...snapshot().busy, sendInFlight: true };
    expect(await fake.submit(snapshot({ busy }))).toEqual({ _tag: "handled" });
    expect(fake.calls).toEqual([]);
    const directAnnotation = { annotation: {} as never, image: null };
    await fake.submit(snapshot({ busy, directAnnotation }));
    expect(fake.toastTitles()).toEqual(["Annotation attached to draft"]);
  });

  it("names the load balancing state in its toast", async () => {
    const fake = fakePorts();
    await fake.submit(snapshot({ loadBalancing: { needed: true, pending: true } }));
    await fake.submit(snapshot({ loadBalancing: { needed: true, pending: false } }));
    expect(fake.toastTitles()).toEqual([
      "Checking the resources of your computers",
      "Choose a computer to continue",
    ]);
  });

  it("gives the offline toast its rotating id", async () => {
    const fake = fakePorts();
    await fake.submit(snapshot({ environmentUnavailable: true }));
    expect(fake.calls[0]?.[1]).toMatchObject({
      title: "Not connected: message not sent",
      id: "offline-0",
    });
  });

  it("advances a pending question instead of sending", async () => {
    const fake = fakePorts(sendContext({ answeringPendingUserInput: true }));
    await fake.submit(snapshot({ hasPendingUserInput: true }));
    expect(fake.names()).toEqual(["advancePendingUserInput"]);
  });

  it("stops when the provider is not available", async () => {
    const fake = fakePorts(sendContext({ providerAvailable: false }));
    expect(await fake.submit(snapshot())).toEqual({ _tag: "handled" });
  });

  it("asks for an update before a multi-model send on an old server", async () => {
    const fake = fakePorts(sendContext({ multipleModelSelections: [] }));
    await fake.submit(
      snapshot({ multiModel: { ...snapshot().multiModel, worktreeBootstrapSupported: false } }),
    );
    expect(fake.calls).toEqual([
      ["threadError", threadId, "Update Leonidas on this computer before you start many models."],
    ]);
  });

  it("needs chosen models and a base branch for a multi-model send", async () => {
    const fake = fakePorts(sendContext({ multipleModelSelections: [] }));
    await fake.submit(snapshot());
    expect(fake.toastTitles()).toEqual(["Choose models and a base branch"]);
  });
});

describe("createTurnSubmitter routes without a new turn", () => {
  it("saves a queued edit in place and leaves edit mode", async () => {
    const fake = fakePorts();
    expect(
      await fake.submit(snapshot({ prompt: "new text", editingQueuedRun: queuedRun })),
    ).toEqual({ _tag: "handled" });
    expect(fake.names()).toEqual([
      "beginQueuedEditSave",
      "editQueuedRun",
      "threadError",
      "releaseAttachments",
      "finishQueuedEdit",
      "endQueuedEditSave",
    ]);
    expect(fake.calls[1]?.[1]).toMatchObject({ threadId, runId, text: "new text" });
    expect(fake.calls[2]).toEqual(["threadError", threadId, null]);
  });

  it("keeps edit mode and shows an error when the save fails", async () => {
    const fake = fakePorts();
    fake.state.editResult = "Failure";
    await fake.submit(snapshot({ prompt: "new text", editingQueuedRun: queuedRun }));
    expect(fake.names()).not.toContain("finishQueuedEdit");
    expect(fake.calls).toContainEqual([
      "threadError",
      threadId,
      "Could not save the edited waiting message.",
    ]);
    expect(fake.names().at(-1)).toBe("endQueuedEditSave");
  });

  it("ignores a second queued edit save while one runs", async () => {
    const fake = fakePorts();
    fake.state.queuedEditSaving = true;
    await fake.submit(snapshot({ prompt: "new text", editingQueuedRun: queuedRun }));
    expect(fake.calls).toEqual([]);
  });

  it("ignores an empty queued edit", async () => {
    const fake = fakePorts();
    await fake.submit(snapshot({ prompt: "   ", editingQueuedRun: queuedRun }));
    expect(fake.calls).toEqual([]);
  });

  it("asks for a Codex chat before it sends feedback", async () => {
    const fake = fakePorts();
    await fake.submit(snapshot({ prompt: "/feedback slow", hasProviderThread: false }));
    expect(fake.toastTitles()).toEqual(["Start a Codex chat first"]);
  });

  it("uploads Codex feedback and marks the upload while it runs", async () => {
    const fake = fakePorts();
    expect(await fake.submit(snapshot({ prompt: "/feedback slow" }))).toEqual({
      _tag: "handled",
    });
    expect(fake.calls).toContainEqual(["uploadFeedback", { reason: "slow" }]);
    expect(fake.calls.filter(([name]) => name === "setFeedbackUploadInFlight")).toEqual([
      ["setFeedbackUploadInFlight", true],
      ["setFeedbackUploadInFlight", false],
    ]);
    expect(fake.names()).toContain("clearDraft");
  });

  it("sends /feedback as a prompt on other providers", async () => {
    const fake = fakePorts(sendContext({ selectedProvider: "claudeAgent" as never }));
    expect((await fake.submit(snapshot({ prompt: "/feedback slow" })))._tag).toBe("continue");
  });

  it("gives the draft back when a plan follow-up fails", async () => {
    const fake = fakePorts();
    fake.state.followUpSent = false;
    await fake.submit(snapshot({ prompt: "yes, go", planFollowUp: { planMarkdown: "# Plan" } }));
    expect(fake.names()).toEqual(["clearDraft", "submitPlanFollowUp", "restoreFollowUpDraft"]);
    expect(fake.calls[2]?.[1]).toMatchObject({ prompt: "yes, go" });
  });

  it("opens a new chat after a background plan follow-up", async () => {
    const fake = fakePorts();
    await fake.submit(
      snapshot({
        prompt: "yes, go",
        planFollowUp: { planMarkdown: "# Plan" },
        submissionIntent: "background",
      }),
    );
    expect(fake.names().at(-1)).toBe("startNewThreadInProject");
  });

  it("switches the interaction mode for /plan", async () => {
    const fake = fakePorts();
    await fake.submit(snapshot({ prompt: "/plan" }));
    expect(fake.calls).toEqual([["setInteractionMode", "plan"], ["clearDraft"]]);
  });

  it("does nothing for an empty draft", async () => {
    const fake = fakePorts();
    expect(await fake.submit(snapshot({ prompt: "  " }))).toEqual({ _tag: "handled" });
    expect(fake.calls).toEqual([]);
  });

  it("asks for a project when the draft lost its project", async () => {
    const fake = fakePorts();
    await fake.submit(snapshot({ hasActiveProject: false }));
    expect(fake.toastTitles()).toEqual(["Choose a project first"]);
  });

  it("needs a base branch for the first message of a new worktree", async () => {
    const fake = fakePorts();
    const worktree = { ...snapshot().worktree, envMode: "worktree", activeMessageCount: 0 };
    await fake.submit(snapshot({ worktree, activeThreadBranch: null }));
    expect(fake.calls).toEqual([
      ["threadError", threadId, "Select a base branch before sending in New separate copy mode."],
    ]);
  });

  it("passes the base branch on when the first message creates a worktree", async () => {
    const fake = fakePorts();
    const worktree = { ...snapshot().worktree, envMode: "worktree", activeMessageCount: 0 };
    const result = await fake.submit(snapshot({ worktree }));
    expect(result).toMatchObject({ _tag: "continue", baseBranchForWorktree: "main" });
  });
});

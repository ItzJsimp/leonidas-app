import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { describe, expect, it } from "vite-plus/test";
import {
  dispatchTurn,
  type CommandFailure,
  type StartTurnInput,
  type TurnDispatchInput,
  type TurnDispatchPorts,
} from "./turnDispatch";
import { handleTurnFailure, type TurnFailurePorts } from "./turnFailure";

const failure = (error: Error): CommandFailure =>
  AsyncResult.failure(Cause.fail(error)) as unknown as CommandFailure;
const success = { _tag: "Success", value: undefined } as never;

const input = (overrides: Partial<TurnDispatchInput> = {}): TurnDispatchInput =>
  ({
    environmentId: EnvironmentId.make("env"),
    threadId: ThreadId.make("thread-1"),
    messageId: "m1",
    createdAt: "2026-01-01T00:00:00.000Z",
    title: "hello",
    outgoingMessageText: "hello",
    turnDispatchMode: "auto",
    compactBeforeSend: false,
    isServerThread: true,
    isLocalDraftThread: false,
    submissionIntent: "foreground",
    baseBranchForWorktree: null,
    startFromOrigin: false,
    runtimeMode: "full-access",
    interactionMode: "default",
    modelSelection: {},
    threadCreateModelSelection: {},
    localCheckoutBranch: null,
    activeThreadBranch: null,
    worktreePath: null,
    threadCreatedAt: "2026-01-01T00:00:00.000Z",
    projectId: "p1",
    projectCwd: "/p",
    replyStyleField: {},
    turnAttachmentsPromise: Promise.resolve([]),
    localAttachmentIds: [],
    buildOutgoingMessageContext: () => undefined,
    backgroundThreadRef: null,
    ...overrides,
  }) as unknown as TurnDispatchInput;

function fakePorts(overrides: Partial<TurnDispatchPorts> = {}) {
  const calls: string[] = [];
  const started: StartTurnInput[] = [];
  const ports: TurnDispatchPorts = {
    persistThreadSettings: async () => {
      calls.push("settings");
      return success;
    },
    startTurn: async (turn) => {
      calls.push("start");
      started.push(turn);
      return success;
    },
    readLiveFileBlockReason: () => null,
    supportsInlineMessageContext: () => true,
    onTurnStarted: () => calls.push("started"),
    background: {
      begin: () => calls.push("bg.begin"),
      markPromoted: () => calls.push("bg.promoted"),
      openNewDraft: async () => true,
      clear: () => calls.push("bg.clear"),
      finalize: () => calls.push("bg.finalize"),
      notifyStarted: () => calls.push("bg.notify"),
      notifyOpenFailed: () => calls.push("bg.openFailed"),
      openFreshComposer: () => calls.push("freshComposer"),
      isSendingChatActive: () => true,
    },
    ...overrides,
  };
  return { ports, calls, started };
}

describe("dispatchTurn", () => {
  it("saves settings, starts the turn and reports success", async () => {
    const { ports, calls, started } = fakePorts();
    const outcome = await dispatchTurn(ports, input());
    expect(calls).toEqual(["settings", "start", "started"]);
    expect(outcome).toMatchObject({ failure: null, turnStartSucceeded: true });
    expect(started[0]).toMatchObject({ dispatchMode: "auto", titleSeed: "hello" });
    expect(started[0]).not.toHaveProperty("bootstrap");
  });

  it("skips the settings save for a new draft thread and bootstraps it", async () => {
    const { ports, calls, started } = fakePorts();
    await dispatchTurn(ports, input({ isServerThread: false, isLocalDraftThread: true }));
    expect(calls).not.toContain("settings");
    expect(started[0]).toHaveProperty("bootstrap.createThread.projectId", "p1");
  });

  it("asks for a worktree when a base branch is set", async () => {
    const { ports, started } = fakePorts();
    await dispatchTurn(ports, input({ baseBranchForWorktree: "main", startFromOrigin: true }));
    expect(started[0]).toHaveProperty("bootstrap.prepareWorktree.baseBranch", "main");
    expect(started[0]).toHaveProperty("bootstrap.prepareWorktree.startFromOrigin", true);
    expect(started[0]).toHaveProperty("bootstrap.runSetupScript", true);
  });

  it("stops at a failed settings save and starts nothing", async () => {
    const bad = failure(new Error("no"));
    const { ports, calls } = fakePorts({ persistThreadSettings: async () => bad });
    const outcome = await dispatchTurn(ports, input());
    expect(calls).toEqual([]);
    expect(outcome.failure).toBe(bad);
    expect(outcome.turnStartSucceeded).toBe(false);
  });

  it("fails when a live file check blocks the upload", async () => {
    const { ports, calls } = fakePorts({ readLiveFileBlockReason: () => "too big" });
    const outcome = await dispatchTurn(ports, input());
    expect(calls).toEqual(["settings"]);
    expect(outcome.failure).not.toBeNull();
  });

  it("compacts first, then sends", async () => {
    const { ports, started } = fakePorts();
    await dispatchTurn(ports, input({ compactBeforeSend: true }));
    expect(started.map((turn) => (turn.message as { text: string }).text)).toEqual([
      "/compact",
      "hello",
    ]);
  });

  it("sends context inline, or as legacy text on an old server", async () => {
    const context = { version: 1, records: [] };
    const build = () => context as never;
    const inline = fakePorts();
    await dispatchTurn(inline.ports, input({ buildOutgoingMessageContext: build }));
    expect(inline.started[0]!.message).toHaveProperty("context");
    const legacy = fakePorts({ supportsInlineMessageContext: () => false });
    await dispatchTurn(legacy.ports, input({ buildOutgoingMessageContext: build }));
    expect(legacy.started[0]!.message).not.toHaveProperty("context");
  });

  it("finalizes a background draft that opened a new one", async () => {
    const ref = { environmentId: "env", threadId: "thread-1" } as never;
    const { ports, calls } = fakePorts();
    const outcome = await dispatchTurn(
      ports,
      input({ submissionIntent: "background", isLocalDraftThread: true, backgroundThreadRef: ref }),
    );
    expect(outcome.backgroundDraftOpened).toBe(true);
    expect(calls).toEqual([
      "settings",
      "bg.begin",
      "start",
      "bg.promoted",
      "started",
      "bg.finalize",
      "bg.notify",
    ]);
  });

  it("clears the background mark when the new draft could not open", async () => {
    const ref = { environmentId: "env", threadId: "thread-1" } as never;
    const base = fakePorts();
    const { ports, calls } = fakePorts({
      background: { ...base.ports.background, openNewDraft: async () => false },
    });
    await dispatchTurn(
      ports,
      input({ submissionIntent: "background", isLocalDraftThread: true, backgroundThreadRef: ref }),
    );
    expect(calls).not.toContain("bg.finalize");
    expect(calls).not.toContain("bg.notify");
  });

  it("opens a fresh composer after a background send from an existing thread", async () => {
    const { ports, calls } = fakePorts();
    await dispatchTurn(ports, input({ submissionIntent: "background" }));
    expect(calls).toEqual(["settings", "start", "started", "freshComposer"]);
  });
});

function failurePorts(overrides: Partial<TurnFailurePorts> = {}) {
  const calls: string[] = [];
  const ports: TurnFailurePorts = {
    composerIsEmpty: () => true,
    removeOptimisticMessage: () => calls.push("removeOptimistic"),
    restoreDraft: () => calls.push("restoreDraft"),
    restoreBackgroundDraft: (id) => calls.push(`restoreBackground:${id}`),
    clearBackgroundSubmission: () => calls.push("clearBackground"),
    newThreadId: () => "fresh",
    threadError: (message) => calls.push(`error:${message}`),
    toastBackgroundFailed: () => calls.push("toastBackground"),
    ...overrides,
  };
  return { ports, calls };
}

const failureInput = (overrides = {}) => ({
  failure: failure(new Error("boom")),
  threadId: "thread-1",
  hasBackgroundDraft: false,
  backgroundDraftOpened: false,
  hasDraftId: false,
  ...overrides,
});

describe("handleTurnFailure", () => {
  it("restores an untouched composer and shows the error", () => {
    const { ports, calls } = failurePorts();
    handleTurnFailure(ports, failureInput());
    expect(calls).toEqual(["removeOptimistic", "restoreDraft", "error:boom"]);
  });

  it("keeps a composer the user already refilled", () => {
    const { ports, calls } = failurePorts({ composerIsEmpty: () => false });
    handleTurnFailure(ports, failureInput());
    expect(calls).toEqual(["error:boom"]);
  });

  it("uses a generic message for a non-error failure", () => {
    const { ports, calls } = failurePorts();
    handleTurnFailure(ports, failureInput({ failure: failure("text" as never) }));
    expect(calls.at(-1)).toBe("error:Could not send message.");
  });

  it("gives a background draft back, then toasts when a new draft opened", () => {
    const { ports, calls } = failurePorts();
    handleTurnFailure(
      ports,
      failureInput({ hasBackgroundDraft: true, backgroundDraftOpened: true, hasDraftId: true }),
    );
    expect(calls).toEqual([
      "restoreBackground:thread-1",
      "clearBackground",
      "removeOptimistic",
      "restoreDraft",
      "error:boom",
      "toastBackground",
    ]);
  });
});

import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { describe, expect, it } from "vite-plus/test";
import { submitArena, type ArenaInput, type ArenaPorts, type ArenaTarget } from "./arenaSubmission";
import type { StartTurnInput } from "./turnDispatch";

const selection = (model: string) =>
  ({ instanceId: "codex", model, options: [] }) as unknown as ArenaTarget["selection"];
const target = (model: string): ArenaTarget => ({
  selection: selection(model),
  text: `hi ${model}`,
  interactionMode: "default",
});

const input = (overrides: Partial<ArenaInput> = {}): ArenaInput =>
  ({
    environmentId: EnvironmentId.make("env"),
    routeThreadKey: "env:thread-1",
    selections: [selection("a"), selection("b")],
    targets: [target("a"), target("b")],
    createdAt: "2026-01-01T00:00:00.000Z",
    title: "hello",
    runtimeMode: "full-access",
    projectId: "p1",
    projectCwd: "/p",
    activeThreadBranch: "main",
    startFromOrigin: false,
    replyStyleField: {},
    turnAttachmentsPromise: Promise.resolve([]),
    localAttachmentIds: [],
    turnUsesAttachmentUploads: false,
    buildOutgoingMessageContext: () => undefined,
    threadId: ThreadId.make("thread-1"),
    ...overrides,
  }) as unknown as ArenaInput;

const ok = { _tag: "Success" } as never;
const bad = AsyncResult.failure(Cause.fail(new Error("nope"))) as never;

function fakePorts(overrides: Partial<ArenaPorts> = {}, draftState = { draft: {} as unknown }) {
  const calls: string[] = [];
  const started: StartTurnInput[] = [];
  const toasts: { title?: string }[] = [];
  const selections = {};
  const ports: ArenaPorts = {
    startTurn: async (turn) => {
      started.push(turn);
      return ok;
    },
    readLiveFileBlockReason: () => null,
    supportsInlineMessageContext: () => true,
    drafts: {
      clearDraft: () => calls.push("clearDraft"),
      readDraft: () => draftState.draft,
      restoreDraft: () => calls.push("restoreDraft"),
      composerAvailable: () => true,
      releaseAttachments: () => calls.push("releaseAttachments"),
      canRestoreFromToast: () => true,
      openDraft: () => calls.push("openDraft"),
    },
    liveState: {
      readSelections: () => selections,
      setSelections: (list) => calls.push(`setSelections:${list.length}`),
      isSendingChatActive: () => true,
      isCurrentSendGeneration: () => true,
      releaseSend: () => calls.push("releaseSend"),
    },
    uncertainSubmissions: new Map(),
    feedback: {
      threadError: (message) => calls.push(`error:${message}`),
      toastAdd: (toast) => {
        toasts.push(toast as { title?: string });
        return `toast-${toasts.length}`;
      },
      toastClose: (id) => calls.push(`close:${id}`),
      toastUpdate: (id) => calls.push(`update:${id}`),
      confirm: () => undefined,
    },
    navigation: { openThread: (id) => calls.push(`open:${id}`) },
    ...overrides,
  };
  return { ports, calls, started, toasts };
}

describe("submitArena", () => {
  it("starts one worktree chat per model and clears the draft", async () => {
    const { ports, calls, started, toasts } = fakePorts();
    await submitArena(ports, input());
    expect(started).toHaveLength(2);
    expect(started[0]).toHaveProperty("bootstrap.prepareWorktree.requireWorktree", true);
    expect(started[0]).toHaveProperty("bootstrap.createThread.worktreePath", null);
    expect(calls).toEqual(["clearDraft", "error:null", "releaseSend"]);
    expect(toasts.map((toast) => toast.title)).toEqual(["Started 2 chats in the background"]);
  });

  it("uses the singular for one chat and releases uploads", async () => {
    const { ports, calls, toasts } = fakePorts();
    await submitArena(
      ports,
      input({
        targets: [target("a")],
        selections: [selection("a")],
        turnUsesAttachmentUploads: true,
      }),
    );
    expect(toasts[0]?.title).toBe("Started 1 chat in the background");
    expect(calls).toContain("releaseAttachments");
  });

  it("restores the draft and the failed models when a start fails", async () => {
    let n = 0;
    const { ports, calls, toasts } = fakePorts({
      startTurn: async () => (n++ === 0 ? bad : ok),
    });
    await submitArena(ports, input());
    expect(toasts.map((toast) => toast.title)).toEqual([
      "Could not start a",
      "Started 1 chat in the background",
    ]);
    expect(calls).toContain("setSelections:1");
    expect(calls).toContain("restoreDraft");
    expect(calls).not.toContain("releaseAttachments");
  });

  it("keeps a possibly started chat and blocks a blind retry", async () => {
    let attempts = 0;
    const { ports } = fakePorts({
      startTurn: async () => {
        attempts += 1;
        return bad;
      },
    });
    await submitArena(ports, input({ targets: [target("a")], selections: [selection("a")] }));
    const key = JSON.stringify(["env:thread-1", "codex", "a"]);
    expect(ports.uncertainSubmissions.get(key)).toBeDefined();
    await submitArena(ports, input({ targets: [target("a")], selections: [selection("a")] }));
    expect(attempts).toBe(1);
  });

  it("offers a restore toast when the user typed again, and restores on click", async () => {
    const state = { draft: {} as unknown };
    const { ports, calls, toasts } = fakePorts(
      {
        startTurn: async () => {
          state.draft = {};
          return bad;
        },
      },
      state,
    );
    await submitArena(ports, input({ targets: [target("a")], selections: [selection("a")] }));
    const recovery = toasts.find(
      (toast) => toast.title === "A background message could not be sent",
    );
    expect(recovery).toBeDefined();
    expect(calls).not.toContain("restoreDraft");
    (recovery as unknown as { actionProps: { onClick: () => void } }).actionProps.onClick();
    expect(calls).toEqual(expect.arrayContaining(["restoreDraft", "openDraft"]));
  });

  it("fails every model when attachments are blocked", async () => {
    const { ports, calls, started } = fakePorts({ readLiveFileBlockReason: () => "too big" });
    await submitArena(ports, input());
    expect(started).toHaveLength(0);
    expect(calls).toEqual(["error:too big", "releaseSend"]);
  });
});

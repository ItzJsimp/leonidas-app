import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  createTurnSubmitter,
  type ComposerSendContext,
  type TurnSubmissionPorts,
  type TurnSubmissionSnapshot,
} from "./turnSubmission";

const threadId = ThreadId.make("thread-1");

const snapshot = (overrides: Partial<TurnSubmissionSnapshot> = {}): TurnSubmissionSnapshot => ({
  prompt: "hello",
  hasDirectAnnotation: false,
  hasNonPromptContent: false,
  activeThreadId: threadId,
  isServerThread: true,
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
  multiModel: {
    worktreeBootstrapSupported: true,
    isLocalDraftThread: true,
    isGitRepo: true,
    hasBranch: true,
  },
  ...overrides,
});

const sendContext = (overrides: Partial<ComposerSendContext> = {}) =>
  ({
    answeringPendingUserInput: false,
    providerAvailable: true,
    multipleModelSelections: null,
    ...overrides,
  }) as ComposerSendContext;

/** In-memory ports that record every call by name. */
function fakePorts(context: ComposerSendContext | undefined = sendContext()) {
  const calls: Array<readonly [string, ...unknown[]]> = [];
  const record =
    (name: string, result?: unknown) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
      return result;
    };
  let usageLimitsOpens = true;
  const ports: TurnSubmissionPorts = {
    drafts: { clearPrompt: record("clearPrompt") as () => void },
    threadCommands: {
      controlGoal: async (action) => calls.push(["controlGoal", action]),
      requestGoal: record("requestGoal"),
      advancePendingUserInput: record("advancePendingUserInput") as () => void,
    },
    feedback: {
      toast: record("toast"),
      threadError: record("threadError"),
      nextEnvironmentUnavailableToastId: () => "offline-0",
    },
    navigation: {
      openUsageLimits: () => {
        calls.push(["openUsageLimits"]);
        return usageLimitsOpens;
      },
      openStuckReport: record("openStuckReport") as () => void,
    },
    liveState: { readSendContext: () => context },
  };
  return {
    submit: createTurnSubmitter(ports).submit,
    calls,
    names: () => calls.map(([name]) => name),
    toastTitles: () =>
      calls.filter(([name]) => name === "toast").map(([, t]) => (t as { title: string }).title),
    failUsageLimits: () => {
      usageLimitsOpens = false;
    },
  };
}

describe("createTurnSubmitter guards", () => {
  it("continues with the send context when no guard applies", async () => {
    const context = sendContext();
    const fake = fakePorts(context);
    expect(await fake.submit(snapshot())).toEqual({ _tag: "continue", sendContext: context });
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
    fake.failUsageLimits();
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
    await fake.submit(snapshot({ busy, hasDirectAnnotation: true }));
    expect(fake.toastTitles()).toEqual(["Annotation attached to draft"]);
  });

  it("checks busy state before load balancing", async () => {
    const fake = fakePorts();
    await fake.submit(
      snapshot({ canOperate: false, loadBalancing: { needed: true, pending: true } }),
    );
    expect(fake.calls).toEqual([]);
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

  it("sends past a pending question when the composer is not answering it", async () => {
    const fake = fakePorts(sendContext({ answeringPendingUserInput: false }));
    expect((await fake.submit(snapshot({ hasPendingUserInput: true })))._tag).toBe("continue");
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

  it("needs chosen models and a branch for a multi-model send", async () => {
    const fake = fakePorts(sendContext({ multipleModelSelections: [] }));
    await fake.submit(snapshot());
    expect(fake.toastTitles()).toEqual(["Choose models and a base branch"]);
  });
});

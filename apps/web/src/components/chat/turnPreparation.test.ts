import { describe, expect, it } from "vite-plus/test";
import type { PreparedDraft } from "./sendDraft";
import { prepareOutgoingTurn } from "./turnPreparation";
import type { ComposerSendContext } from "./turnSubmission";

const sendContext = (overrides: Partial<ComposerSendContext> = {}) =>
  ({
    files: [],
    terminalContexts: [],
    reviewComments: [],
    threadContexts: [],
    selectedProvider: "codex",
    selectedModel: null,
    selectedProviderModels: [],
    selectedPromptEffort: null,
    ...overrides,
  }) as unknown as ComposerSendContext;

const draft = (overrides: Partial<PreparedDraft> = {}): PreparedDraft => ({
  composerImages: [],
  composerPreviewAnnotations: [],
  promptForSend: "hello",
  trimmedPrompt: "hello",
  sendableTerminalContexts: [],
  expiredTerminalContextCount: 0,
  hasSendableContent: true,
  ...overrides,
});

const prepare = (input: Partial<Parameters<typeof prepareOutgoingTurn>[0]> = {}) =>
  prepareOutgoingTurn({
    sendContext: sendContext(),
    draft: draft(),
    dispatchMode: "auto",
    phase: "ready",
    sendQueuesBehindSetup: false,
    resumeCompactionTokens: null,
    keepFullHistory: false,
    ...input,
  });

describe("prepareOutgoingTurn", () => {
  it("sends a plain message at once", () => {
    const turn = prepare();
    expect(turn.messageTextForSend).toBe("hello");
    expect(turn.outgoingMessageText).toBe("hello");
    expect(turn.turnDispatchMode).toBe("auto");
    expect(turn.shouldQueueBehindActiveRun).toBe(false);
    expect(turn.title).toBe("hello");
  });

  it("queues behind a running turn only when the user chose queue", () => {
    expect(prepare({ phase: "running", dispatchMode: "queue" }).shouldQueueBehindActiveRun).toBe(
      true,
    );
    expect(prepare({ phase: "running", dispatchMode: "steer" }).shouldQueueBehindActiveRun).toBe(
      false,
    );
  });

  it("queues behind setup and forces queue dispatch", () => {
    const turn = prepare({ sendQueuesBehindSetup: true });
    expect(turn.turnDispatchMode).toBe("queue");
    expect(turn.shouldQueueBehindActiveRun).toBe(true);
  });

  it("compacts a stale session first, except for /compact itself", () => {
    const stale = { resumeCompactionTokens: 5000 };
    expect(prepare(stale).compactBeforeSend).toBe(true);
    expect(prepare({ ...stale, keepFullHistory: true }).compactBeforeSend).toBe(false);
    const compactDraft = draft({ promptForSend: "/Compact", trimmedPrompt: "/Compact" });
    expect(prepare({ ...stale, draft: compactDraft }).compactBeforeSend).toBe(false);
  });

  it("names an attachment-only message after its first file", () => {
    const file = { type: "file", id: "f1", name: "notes.txt" };
    const turn = prepare({
      sendContext: sendContext({ files: [file] as unknown as ComposerSendContext["files"] }),
      draft: draft({ promptForSend: "", trimmedPrompt: "" }),
    });
    expect(turn.title).toBe("File: notes.txt");
    expect(turn.optimisticAttachments[0]).toMatchObject({ type: "file", id: "f1" });
  });

  it("falls back to New chat with nothing to name it", () => {
    const turn = prepare({ draft: draft({ promptForSend: "", trimmedPrompt: "" }) });
    expect(turn.title).toBe("New chat");
  });
});

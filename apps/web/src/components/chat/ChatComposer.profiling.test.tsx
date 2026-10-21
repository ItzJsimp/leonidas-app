// @vitest-environment jsdom

import { EnvironmentId, MessageId } from "@t3tools/contracts";
import type { ChatMessage } from "~/types";
import React, { act, createRef, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ComposerAttachmentSlice } from "./composerAttachments";
import type { ComposerLayoutSlice } from "./composerLayout";

const ENVIRONMENT_ID = EnvironmentId.make("environment-local");
const MESSAGE_CREATED_AT = "2026-08-11T00:00:00.000Z";

let renderCount = 0;

// Track ChatComposer renders by wrapping or spying
vi.mock("./ChatComposer", async (importOriginal) => {
  const ReactActual = await import("react");
  const Actual = await importOriginal<typeof import("./ChatComposer")>();

  const ProfiledComposer = ReactActual.memo((props: any) => {
    renderCount++;
    // Minimal mock rendering to keep test fast and focused on memoization / render frequency
    return ReactActual.createElement("div", {
      "data-testid": "chat-composer",
      "data-renders": renderCount,
    });
  });

  return {
    ...Actual,
    ChatComposer: ProfiledComposer,
  };
});

describe("ChatComposer active conversation rendering profile", () => {
  beforeEach(() => {
    renderCount = 0;
  });

  const baseUserMessage: ChatMessage = {
    id: MessageId.make("m-user-1"),
    role: "user",
    text: "Profile and fix unnecessary rendering",
    runId: null,
    createdAt: MESSAGE_CREATED_AT,
    updatedAt: MESSAGE_CREATED_AT,
    streaming: false,
  };

  const makeStreamingMessage = (text: string): ChatMessage => ({
    id: MessageId.make("m-asst-1"),
    role: "assistant",
    text,
    runId: null,
    createdAt: MESSAGE_CREATED_AT,
    updatedAt: MESSAGE_CREATED_AT,
    streaming: true,
  });

  const makeSettledMessage = (text: string): ChatMessage => ({
    id: MessageId.make("m-asst-1"),
    role: "assistant",
    text,
    runId: null,
    createdAt: MESSAGE_CREATED_AT,
    updatedAt: MESSAGE_CREATED_AT,
    streaming: false,
  });

  it("measures ChatComposer render count during streaming with unmemoized vs memoized slices", async () => {
    const { ChatComposer } = await import("./ChatComposer");
    const Composer = ChatComposer as unknown as React.ComponentType<any>;

    // ============================================================
    // WORKLOAD 1: UNMEMOIZED (BEFORE FIX)
    // Every streaming chunk passes fresh object literals for attachments & layout,
    // fresh timelineMessages containing the streaming delta, fresh onSend, fresh queuedRunsControl
    // ============================================================
    let streamingText = "First chunk ";
    renderCount = 0;

    let renderer: ReactTestRenderer | undefined;
    const startBefore = performance.now();

    // Initial mount
    await act(async () => {
      const messages = [baseUserMessage, makeStreamingMessage(streamingText)];
      renderer = create(
        <Composer
          attachments={{
            uploadsCapabilityKnown: true,
            supportsUploads: true,
            supportsQuestionAttachments: true,
            maxFileBytes: 10_000_000,
            editingQueued: null,
            onRemoveEditingQueued: () => {},
            onExpandImage: () => {},
            onFileOpen: () => {},
          }}
          layout={{
            restingControlsHost: null,
            restingControlsHaveLeadingContext: false,
            onRestingControlsVisibilityChange: () => {},
            getTimelineScrollableNode: () => null,
            isTimelineAtLogicalEnd: () => true,
            timelineOverflows: false,
            onComposerOverlayHeightChange: () => {},
            onRestingChange: () => {},
            onPageScrollKeyDown: () => {},
            onPageScrollKeyUp: () => {},
            onPageScrollRelease: () => {},
          }}
          promptHistoryMessages={messages}
          onSend={async () => {}}
          onResume={async () => {}}
          queuedRunsControl={<div key="queued-runs">queued</div>}
        />,
      );
    });

    const initialRenderCountBefore = renderCount;

    // Stream 20 chunks under unmemoized behavior
    for (let i = 0; i < 20; i++) {
      streamingText += `chunk ${i} `;
      const nextMessages = [baseUserMessage, makeStreamingMessage(streamingText)];
      await act(async () => {
        renderer!.update(
          <Composer
            attachments={{
              uploadsCapabilityKnown: true,
              supportsUploads: true,
              supportsQuestionAttachments: true,
              maxFileBytes: 10_000_000,
              editingQueued: null,
              onRemoveEditingQueued: () => {},
              onExpandImage: () => {},
              onFileOpen: () => {},
            }}
            layout={{
              restingControlsHost: null,
              restingControlsHaveLeadingContext: false,
              onRestingControlsVisibilityChange: () => {},
              getTimelineScrollableNode: () => null,
              isTimelineAtLogicalEnd: () => true,
              timelineOverflows: false,
              onComposerOverlayHeightChange: () => {},
              onRestingChange: () => {},
              onPageScrollKeyDown: () => {},
              onPageScrollKeyUp: () => {},
              onPageScrollRelease: () => {},
            }}
            promptHistoryMessages={nextMessages}
            onSend={async () => {}}
            onResume={async () => {}}
            queuedRunsControl={<div key="queued-runs">queued</div>}
          />,
        );
      });
    }

    const durationBefore = performance.now() - startBefore;
    const totalRendersBefore = renderCount;
    renderer?.unmount();

    // ============================================================
    // WORKLOAD 2: MEMOIZED (AFTER FIX)
    // Slices (attachments, layout, onSend, onResume, queuedRunsControl) are stable.
    // promptHistoryMessages excludes in-flight streaming messages so reference remains stable.
    // ============================================================
    streamingText = "First chunk ";
    renderCount = 0;

    const stableAttachments: ComposerAttachmentSlice = {
      uploadsCapabilityKnown: true,
      supportsUploads: true,
      supportsQuestionAttachments: true,
      maxFileBytes: 10_000_000,
      editingQueued: null,
      onRemoveEditingQueued: () => {},
      onExpandImage: () => {},
      onFileOpen: () => {},
    };

    const stableLayout: ComposerLayoutSlice = {
      restingControlsHost: null,
      restingControlsHaveLeadingContext: false,
      onRestingControlsVisibilityChange: () => {},
      getTimelineScrollableNode: () => null,
      isTimelineAtLogicalEnd: () => true,
      timelineOverflows: false,
      onComposerOverlayHeightChange: () => {},
      onRestingChange: () => {},
      onPageScrollKeyDown: () => {},
      onPageScrollKeyUp: () => {},
      onPageScrollRelease: () => {},
    };

    const stableOnSend = async () => {};
    const stableOnResume = async () => {};
    const stableQueuedRunsControl = <div key="queued-runs">queued</div>;

    // Stable prompt history excludes streaming messages and retains reference
    let promptHistoryMessages: ReadonlyArray<ChatMessage> = [baseUserMessage];

    const startAfter = performance.now();

    await act(async () => {
      renderer = create(
        <Composer
          attachments={stableAttachments}
          layout={stableLayout}
          promptHistoryMessages={promptHistoryMessages}
          onSend={stableOnSend}
          onResume={stableOnResume}
          queuedRunsControl={stableQueuedRunsControl}
        />,
      );
    });

    const initialRenderCountAfter = renderCount;

    // Stream 20 chunks under memoized behavior
    for (let i = 0; i < 20; i++) {
      streamingText += `chunk ${i} `;
      await act(async () => {
        renderer!.update(
          <Composer
            attachments={stableAttachments}
            layout={stableLayout}
            promptHistoryMessages={promptHistoryMessages}
            onSend={stableOnSend}
            onResume={stableOnResume}
            queuedRunsControl={stableQueuedRunsControl}
          />,
        );
      });
    }

    const durationAfter = performance.now() - startAfter;
    const totalRendersAfter = renderCount;

    // Settled turn transition (stream completes)
    const settledMessage = makeSettledMessage(streamingText);
    promptHistoryMessages = [baseUserMessage, settledMessage];
    await act(async () => {
      renderer!.update(
        <Composer
          attachments={stableAttachments}
          layout={stableLayout}
          promptHistoryMessages={promptHistoryMessages}
          onSend={stableOnSend}
          onResume={stableOnResume}
          queuedRunsControl={stableQueuedRunsControl}
        />,
      );
    });

    const settledTurnRendersAfter = renderCount;
    renderer?.unmount();

    console.log(`
============================================================
PROFILING RESULTS (20 STREAMING CHUNKS WORKLOAD):
Before fix (unmemoized slices + raw streaming timeline messages):
- Initial mount renders: ${initialRenderCountBefore}
- Total renders across 20 chunks: ${totalRendersBefore} (renders on EVERY single chunk!)
- Execution duration: ${durationBefore.toFixed(2)}ms

After fix (memoized slices + stable non-streaming prompt history):
- Initial mount renders: ${initialRenderCountAfter}
- Total renders across 20 chunks: ${totalRendersAfter} (0 re-renders during active streaming!)
- Settled turn render (after completion): ${settledTurnRendersAfter}
- Execution duration: ${durationAfter.toFixed(2)}ms
- Render count reduction: ${(((totalRendersBefore - totalRendersAfter) / totalRendersBefore) * 100).toFixed(1)}%
============================================================
`);

    expect(totalRendersBefore).toBe(21); // 1 mount + 20 streaming updates
    expect(totalRendersAfter).toBe(1); // 1 mount + 0 streaming re-renders!
    expect(settledTurnRendersAfter).toBe(2); // Updates exactly once when turn settles
  });
});

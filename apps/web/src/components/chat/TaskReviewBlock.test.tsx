// @vitest-environment jsdom
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

import { useComposerDraftStore } from "~/composerDraftStore";
import { TaskReviewBlock } from "./TaskReviewBlock";

const update = vi.fn();
vi.mock("./useLinkedTask", () => ({
  useLinkedTask: () => ({
    task: { status: "review", title: "Example task", checklist: null, history: [] },
    update,
  }),
}));

it("keeps an existing composer draft when sending a task back", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const environmentId = EnvironmentId.make("test-environment");
  const threadId = ThreadId.make("test-thread");
  const target = scopeThreadRef(environmentId, threadId);
  useComposerDraftStore.getState().setPrompt(target, "Please check the graph.");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(<TaskReviewBlock environmentId={environmentId} threadId={threadId} />),
    );
    const button = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("Send back"),
    );
    expect(button).toBeDefined();
    await act(() => button!.click());
    expect(
      useComposerDraftStore.getState().draftsByThreadKey[scopedThreadKey(target)]?.prompt,
    ).toContain("Please check the graph.");
    expect(update).toHaveBeenCalledWith(
      { status: "in_progress", note: "Sent back from chat" },
      "Could not send back",
    );
  } finally {
    await act(() => root.unmount());
    container.remove();
    useComposerDraftStore.getState().clearDraftThread(target);
    vi.unstubAllGlobals();
  }
});

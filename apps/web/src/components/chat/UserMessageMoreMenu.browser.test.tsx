import "~/index.css";

import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import type { TimelineRowSharedState } from "./TimelineRowContext";
import { TimelineRowCtx } from "./TimelineRowContext";
import { UserMessageMoreMenu } from "./UserMessageMoreMenu";

const mocks = vi.hoisted(() => ({
  createSavedItem: vi.fn(),
  drop: vi.fn(),
  workspaceEnvironmentId: "environment-1",
}));

vi.mock("@effect/atom-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effect/atom-react")>()),
  useAtomValue: () => true,
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => mocks.createSavedItem,
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: { createSavedItem: { permissionAtom: vi.fn() } },
}));
vi.mock("../../state/entities", () => ({
  useThreadShell: () => ({ projectId: "project-1" }),
}));
vi.mock("../workspace/useProjectAiosWorkspace", () => ({
  useProjectAiosWorkspace: () => ({
    environmentId: mocks.workspaceEnvironmentId,
    scope: { workspaceId: "workspace-1" },
    scopeReady: true,
  }),
}));
vi.mock("../capture/useCaptureDrop", () => ({
  useCaptureDrop: () => ({ drop: mocks.drop, canDrop: true }),
}));

const message = "Summarize this repository and list the main risks.";
const context = {
  activeThreadEnvironmentId: EnvironmentId.make("environment-1"),
  threadRef: {
    environmentId: EnvironmentId.make("environment-1"),
    threadId: ThreadId.make("thread-1"),
  },
} as TimelineRowSharedState;

async function openMenu(container: HTMLElement) {
  const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="More"]');
  expect(trigger).not.toBeNull();
  expect(trigger?.querySelector("svg")).not.toBeNull();
  await act(async () => trigger!.click());
}

describe("UserMessageMoreMenu", () => {
  it.each([1280, 390])("saves the message as a prompt at %i px", async (width) => {
    await page.viewport(width, 800);
    mocks.createSavedItem.mockResolvedValue({ _tag: "Success", value: {} });
    await using screen = await render(
      <TimelineRowCtx.Provider value={context}>
        <UserMessageMoreMenu text={message} />
      </TimelineRowCtx.Provider>,
    );

    await openMenu(screen.container);
    const save = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (button) => button.textContent?.includes("Save as prompt"),
    );
    expect(save).toBeDefined();
    await act(async () => save!.click());

    expect(mocks.createSavedItem).toHaveBeenCalledTimes(1);
    const [{ environmentId, input }] = mocks.createSavedItem.mock.calls[0]!;
    expect(environmentId).toBe(context.activeThreadEnvironmentId);
    expect(input).toMatchObject({
      kind: "prompt",
      title: message,
      body: message,
      tags: [],
      projectId: "project-1",
      workspaceId: "workspace-1",
    });
    expect(input.commandId).toBeTruthy();
    expect(input.id).toBeTruthy();
  });

  it.each([1280, 390])("adds the message text to the notepad at %i px", async (width) => {
    await page.viewport(width, 800);
    mocks.drop.mockResolvedValue({ ok: true });
    await using screen = await render(
      <TimelineRowCtx.Provider value={context}>
        <UserMessageMoreMenu text={message} />
      </TimelineRowCtx.Provider>,
    );

    await openMenu(screen.container);
    const add = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (button) => button.textContent?.includes("Add to notepad"),
    );
    expect(add).toBeDefined();
    await act(async () => add!.click());
    expect(mocks.drop).toHaveBeenCalledWith(message);
    expect(mocks.createSavedItem).not.toHaveBeenCalled();
  });

  it("disables prompt saving when the workspace belongs to another environment", async () => {
    await page.viewport(1280, 800);
    mocks.createSavedItem.mockClear();
    mocks.workspaceEnvironmentId = "primary-environment";
    await using screen = await render(
      <TimelineRowCtx.Provider value={context}>
        <UserMessageMoreMenu text={message} />
      </TimelineRowCtx.Provider>,
    );

    await openMenu(screen.container);
    const save = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.includes("Save as prompt"),
    );
    expect(save?.getAttribute("aria-disabled")).toBe("true");
    await act(async () => save?.click());
    expect(mocks.createSavedItem).not.toHaveBeenCalled();
    mocks.workspaceEnvironmentId = "environment-1";
  });
});

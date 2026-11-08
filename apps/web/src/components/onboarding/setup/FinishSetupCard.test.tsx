// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EnvironmentId } from "@t3tools/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import {
  EMPTY_SETUP_STATE,
  SETUP_ITEMS,
  SETUP_STATE_STORAGE_KEY,
  type SetupState,
} from "../../../onboarding/setupState.logic";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../../../onboarding/useAiosFileWriter", () => ({
  useAiosFileWriter: () => ({ canWrite: true, write: vi.fn() }),
}));
const chat = vi.hoisted(() => ({
  ensureFolderProject: vi.fn(async (_folder: string) => ({
    ok: true as const,
    projectId: "p1",
    workspaceRoot: "C:/aios",
  })),
  startChat: vi.fn(
    async (
      _args: unknown,
    ): Promise<{ ok: true; threadId: string } | { ok: false; message: string }> => ({
      ok: true,
      threadId: "t1",
    }),
  ),
}));
vi.mock("../../../onboarding/useOnboardingChat", () => ({ useOnboardingChat: () => chat }));
vi.mock("../../../state/environments", () => ({
  usePrimaryEnvironment: () => ({ environmentId: EnvironmentId.make("local") }),
}));
const { stub } = vi.hoisted(() => ({
  stub: (name: string) => () => ({
    [name]: (props: { onContinue: () => void }) => (
      <button type="button" onClick={() => props.onContinue()}>
        finish {name}
      </button>
    ),
  }),
}));
vi.mock("../VoiceStep", stub("VoiceStep"));
vi.mock("../AiLevelStep", stub("AiLevelStep"));
vi.mock("../LeonidasSkillsStep", stub("LeonidasSkillsStep"));
vi.mock("../LeonidasLayaStep", stub("LeonidasLayaStep"));
vi.mock("../AgentsStep", () => ({ AgentsStep: () => null }));

const { FinishSetupCard } = await import("./FinishSetupCard");

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(state: Partial<SetupState> | null) {
  if (state) {
    localStorage.setItem(
      SETUP_STATE_STORAGE_KEY,
      JSON.stringify({ ...EMPTY_SETUP_STATE, ...state }),
    );
  }
  await act(async () => root.render(<FinishSetupCard />));
}

function button(name: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll("button")].find(
    (node) => node.textContent?.trim() === name || node.getAttribute("aria-label") === name,
  );
  if (!found) throw new Error(`no button ${name}`);
  return found;
}

const skippedEverything: Partial<SetupState> = {
  startedAt: "2026-10-20T00:00:00Z",
  done: ["basics"],
  tourSeen: true,
};

it("stays hidden for users who never ran the new setup", async () => {
  await render(null);
  expect(container.innerHTML).toBe("");
});

it("lists every skipped item with its ability line and points", async () => {
  await render(skippedEverything);
  for (const item of SETUP_ITEMS.filter((entry) => entry.id !== "basics")) {
    expect(container.textContent).toContain(item.ability);
  }
  expect(container.textContent).toContain("+20");
  expect(container.textContent).toContain("+25");
  expect(container.querySelector('[role="meter"]')?.getAttribute("aria-valuenow")).toBe("10");
});

it("marks an item done from its step, and the meter grows", async () => {
  await render(skippedEverything);
  await act(async () => button("Start: Turn on voice").click());
  await act(async () => button("finish VoiceStep").click());
  expect(container.textContent).not.toContain("I can't hear you yet.");
  expect(container.querySelector('[role="meter"]')?.getAttribute("aria-valuenow")).toBe("20");
});

it("runs the tour once after setup, and again on request", async () => {
  await render({ ...skippedEverything, tourSeen: false });
  expect(document.body.querySelector("#setup-tour-title")?.textContent).toBe("Home");
  await act(async () => button("Skip tour").click());
  expect(document.body.querySelector("#setup-tour-title")).toBeNull();
  await act(async () => button("Take the tour again").click());
  expect(document.body.querySelector("#setup-tour-title")).not.toBeNull();
});

it("starts the first chat, and the meter grows by 20", async () => {
  await render(skippedEverything);
  await act(async () => button("Start: Have your first chat").click());
  await act(async () => button("Start my first chat").click());
  expect(chat.startChat).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: "p1", title: "First chat" }),
  );
  expect(container.querySelector('[role="meter"]')?.getAttribute("aria-valuenow")).toBe("30");
});

it("shows why the first chat could not start, and keeps the item open", async () => {
  chat.startChat.mockResolvedValueOnce({ ok: false, message: "Connect an AI first." });
  await render(skippedEverything);
  await act(async () => button("Start: Have your first chat").click());
  await act(async () => button("Start my first chat").click());
  expect(document.body.querySelector('[role="alert"]')?.textContent).toBe("Connect an AI first.");
  expect(container.querySelector('[role="meter"]')?.getAttribute("aria-valuenow")).toBe("10");
});

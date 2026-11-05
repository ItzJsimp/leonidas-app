// @vitest-environment jsdom
import type { EnvironmentId, ServerProviderSkill } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const toasts = vi.hoisted(() => ({ add: vi.fn(), close: vi.fn() }));
const rpc = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../ui/toast", () => ({ toastManager: toasts }));
vi.mock("../../connection/runtime", () => ({ connectionAtomRuntime: {} }));
vi.mock("../../state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => rpc.run }));
vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  createEnvironmentRpcQueryAtomFamily: () => () => null,
}));

import { ComposerAutoPickSkillsButton } from "./ComposerAutoPickSkillsButton";

const skill = (name: string, description: string): ServerProviderSkill => ({
  name,
  description,
  path: `/skills/${name}/SKILL.md`,
  enabled: true,
});
const skills = [
  skill("windows-toast", "Send native Windows toast notifications to the desktop"),
  skill("grilling", "Grill the user about a plan or idea"),
  skill("archify", "Draw architecture diagrams of a system"),
];
const TOAST_PROMPT = "Send me a desktop toast when the build finishes";
const answer = (...names: string[]) => ({
  _tag: "Success",
  value: { picks: names.map((name) => ({ name, reason: "fits" })), modelUsed: true },
});

let host: HTMLElement;
let root: Root;
let draft: string;
const setPrompt = vi.fn((next: string) => {
  draft = next;
});

async function mount(prompt: string, cwd: string | null = "/project") {
  draft = prompt;
  await act(async () => {
    root.render(
      <ComposerAutoPickSkillsButton
        environmentId={"env" as EnvironmentId}
        cwd={cwd}
        prompt={prompt}
        projectText=""
        skills={skills}
        cap={3}
        getPrompt={() => draft}
        setPrompt={setPrompt}
      />,
    );
  });
  return host.querySelector("button") as HTMLButtonElement;
}
const click = (button: HTMLButtonElement) => act(async () => button.click());
const lastToast = () => toasts.add.mock.calls.at(-1)![0];

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  toasts.add.mockClear();
  setPrompt.mockClear();
  rpc.run.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("ComposerAutoPickSkillsButton", () => {
  it("is named for what it does", async () => {
    const button = await mount("");
    expect(button.textContent).toContain("Auto-pick skills");
  });

  it("explains itself instead of doing nothing when the draft is empty", async () => {
    const button = await mount("   ");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    await click(button);
    expect(rpc.run).not.toHaveBeenCalled();
    expect(lastToast().title).toBe("Write your message first");
  });

  it("leads the draft with the model's pick and offers Undo", async () => {
    rpc.run.mockResolvedValue(answer("windows-toast"));
    await click(await mount(TOAST_PROMPT));
    expect(draft).toBe(`$windows-toast ${TOAST_PROMPT}`);
    expect(lastToast().title).toBe("Added 1 skill");
    expect(lastToast().description).toBe("$windows-toast (fits)");
    await act(async () => lastToast().actionProps.onClick());
    expect(draft).toBe(TOAST_PROMPT);
  });

  it("Undo keeps text typed after the click", async () => {
    rpc.run.mockResolvedValue(answer("windows-toast"));
    await click(await mount(TOAST_PROMPT));
    draft = `${draft} and tell me the time`;
    await act(async () => lastToast().actionProps.onClick());
    expect(draft).toBe(`${TOAST_PROMPT} and tell me the time`);
  });

  it("clicking again on the same text asks nothing new and adds nothing", async () => {
    rpc.run.mockResolvedValue(answer("windows-toast"));
    const button = await mount(TOAST_PROMPT);
    await click(button);
    const after = draft;
    await click(button);
    expect(rpc.run).toHaveBeenCalledTimes(1);
    expect(draft).toBe(after);
    expect(lastToast().title).toBe("Already the best fit");
  });

  it("clicking again after an edit replaces its own earlier skills", async () => {
    rpc.run.mockResolvedValueOnce(answer("windows-toast"));
    const button = await mount(TOAST_PROMPT);
    await click(button);
    draft = "$windows-toast Grill me on my idea for a habit tracker app";
    rpc.run.mockResolvedValueOnce(answer("grilling"));
    await click(button);
    expect(draft).toBe("$grilling Grill me on my idea for a habit tracker app");
  });

  it("keeps skills the user typed", async () => {
    rpc.run.mockResolvedValue(answer("windows-toast"));
    await click(await mount(`$archify ${TOAST_PROMPT}`));
    expect(draft).toBe(`$windows-toast $archify ${TOAST_PROMPT}`);
  });

  it("falls back to keywords, and says so, when the model cannot answer", async () => {
    rpc.run.mockResolvedValue({ _tag: "Success", value: { picks: [], modelUsed: false } });
    await click(await mount(TOAST_PROMPT));
    expect(draft).toBe(`$windows-toast ${TOAST_PROMPT}`);
    expect(lastToast().description).toContain("keywords");
  });

  it("uses keywords without calling the model when there is no project folder", async () => {
    await click(await mount(TOAST_PROMPT, null));
    expect(rpc.run).not.toHaveBeenCalled();
    expect(draft).toBe(`$windows-toast ${TOAST_PROMPT}`);
  });

  it("leaves the draft alone when no skill fits", async () => {
    await click(await mount("thanks, looks good"));
    expect(setPrompt).not.toHaveBeenCalled();
    expect(lastToast().title).toBe("No skill matched");
  });

  it("does not overwrite text typed while the model was thinking", async () => {
    let finish!: (value: unknown) => void;
    rpc.run.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const button = await mount(TOAST_PROMPT);
    await click(button);
    draft = `${TOAST_PROMPT} please`;
    await act(async () => finish(answer("windows-toast")));
    expect(setPrompt).not.toHaveBeenCalled();
    expect(lastToast().title).toBe("Your message changed");
  });
});

describe("double click", () => {
  it("asks the model once and shows the busy label meanwhile", async () => {
    let finish!: (value: unknown) => void;
    rpc.run.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const button = await mount(TOAST_PROMPT);
    await click(button);
    await click(button);
    expect(rpc.run).toHaveBeenCalledTimes(1);
    expect(button.textContent).toContain("Picking");
    await act(async () => finish(answer("windows-toast")));
    expect(button.textContent).toContain("Auto-pick skills");
  });
});

describe("typing nudge", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const nudged = () => host.querySelector("[data-nudge]") !== null;

  it("appears after a pause on a draft a skill fits, and goes when the text changes", async () => {
    await mount(TOAST_PROMPT);
    expect(nudged()).toBe(false);
    await act(async () => void vi.advanceTimersByTime(1_600));
    expect(nudged()).toBe(true);
    await mount("Something else entirely that no skill here covers at all");
    expect(nudged()).toBe(false);
  });

  it("stays away from a short draft, a draft that has skills, and a draft nothing fits", async () => {
    for (const prompt of [
      "desktop toast",
      `$windows-toast ${TOAST_PROMPT}`,
      "Something else entirely that no skill here covers at all",
    ]) {
      await mount(prompt);
      await act(async () => void vi.advanceTimersByTime(3_000));
      expect(nudged(), prompt).toBe(false);
    }
  });
});

describe("first-use note", () => {
  it("shows once for a real draft, then stays gone after the first click", async () => {
    rpc.run.mockResolvedValue(answer("windows-toast"));
    const button = await mount(TOAST_PROMPT);
    expect(document.body.textContent).toContain("New: Auto-pick skills");
    await click(button);
    expect(document.body.textContent).not.toContain("New: Auto-pick skills");
    await mount(TOAST_PROMPT);
    expect(document.body.textContent).not.toContain("New: Auto-pick skills");
  });

  it("stays quiet for a short draft", async () => {
    await mount("hi there");
    expect(document.body.textContent).not.toContain("New: Auto-pick skills");
  });
});

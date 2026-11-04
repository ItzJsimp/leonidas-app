// @vitest-environment jsdom
import type { ServerProviderSkill } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const toasts = vi.hoisted(() => ({ add: vi.fn(), close: vi.fn() }));
vi.mock("../ui/toast", () => ({ toastManager: toasts }));

import { ComposerSkillSuggestButton } from "./ComposerSkillSuggestButton";

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

let host: HTMLElement;
let root: Root;
let draft: string;
const setPrompt = vi.fn((next: string) => {
  draft = next;
});

async function mount(prompt: string) {
  draft = prompt;
  await act(async () => {
    root.render(
      <ComposerSkillSuggestButton
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

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  toasts.add.mockClear();
  setPrompt.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("ComposerSkillSuggestButton", () => {
  it("is disabled while the draft is empty", async () => {
    expect((await mount("   ")).disabled).toBe(true);
  });

  it("leads the draft with the best skill and offers Undo", async () => {
    const button = await mount("Send me a desktop toast when the build finishes");
    await act(async () => button.click());
    expect(draft).toBe("$windows-toast Send me a desktop toast when the build finishes");
    const toast = toasts.add.mock.calls[0]![0];
    expect(toast.title).toBe("Added 1 skill");
    await act(async () => toast.actionProps.onClick());
    expect(draft).toBe("Send me a desktop toast when the build finishes");
  });

  it("Undo keeps text typed after the click", async () => {
    const button = await mount("Send me a desktop toast when the build finishes");
    await act(async () => button.click());
    draft = `${draft} and tell me the time`;
    await act(async () => toasts.add.mock.calls[0]![0].actionProps.onClick());
    expect(draft).toBe("Send me a desktop toast when the build finishes and tell me the time");
  });

  it("says so and leaves the draft alone when no skill fits", async () => {
    const button = await mount("thanks, looks good");
    await act(async () => button.click());
    expect(setPrompt).not.toHaveBeenCalled();
    expect(toasts.add.mock.calls[0]![0].title).toBe("No skill fits this message");
  });
});

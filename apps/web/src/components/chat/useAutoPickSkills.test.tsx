// @vitest-environment jsdom
import type { AutoPickEngine, EnvironmentId, ServerProviderSkill } from "@t3tools/contracts";
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

import { useAutoPickSkills } from "./useAutoPickSkills";

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

let picker: ReturnType<typeof useAutoPickSkills>;
function Harness(props: { prompt: string; cwd: string | null; engine: AutoPickEngine }) {
  picker = useAutoPickSkills({
    environmentId: "env" as EnvironmentId,
    cwd: props.cwd,
    prompt: props.prompt,
    projectText: "",
    skills,
    cap: 3,
    engine: props.engine,
    openRouterModel: "openrouter/free",
    groqModel: "qwen/qwen3.8-27b",
    localModel: "",
    getPrompt: () => draft,
    setPrompt,
  });
  return null;
}

/** Mounts the hook with `prompt` as the draft and returns a function that runs one pick. */
async function mount(
  prompt: string,
  cwd: string | null = "/project",
  engine: AutoPickEngine = "auto",
) {
  draft = prompt;
  await act(async () => {
    root.render(<Harness prompt={prompt} cwd={cwd} engine={engine} />);
  });
  return () => act(async () => void (await picker.pick()));
}
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

describe("useAutoPickSkills", () => {
  it("explains itself instead of doing nothing when the draft is empty", async () => {
    const run = await mount("   ");
    await run();
    expect(rpc.run).not.toHaveBeenCalled();
    expect(lastToast().title).toBe("Write your message first");
  });

  it("leads the draft with the model's pick and offers Undo", async () => {
    rpc.run.mockResolvedValue(answer("windows-toast"));
    await (
      await mount(TOAST_PROMPT)
    )();
    expect(draft).toBe(`$windows-toast ${TOAST_PROMPT}`);
    expect(lastToast().title).toBe("Added 1 skill");
    expect(lastToast().description).toBe("$windows-toast (fits)");
    await act(async () => lastToast().actionProps.onClick());
    expect(draft).toBe(TOAST_PROMPT);
  });

  it("Undo keeps text typed after the click", async () => {
    rpc.run.mockResolvedValue(answer("windows-toast"));
    await (
      await mount(TOAST_PROMPT)
    )();
    draft = `${draft} and tell me the time`;
    await act(async () => lastToast().actionProps.onClick());
    expect(draft).toBe(`${TOAST_PROMPT} and tell me the time`);
  });

  it("clicking again on the same text asks nothing new and adds nothing", async () => {
    rpc.run.mockResolvedValue(answer("windows-toast"));
    const run = await mount(TOAST_PROMPT);
    await run();
    const after = draft;
    await run();
    expect(rpc.run).toHaveBeenCalledTimes(1);
    expect(draft).toBe(after);
    expect(lastToast().title).toBe("Already the best fit");
  });

  it("clicking again after an edit replaces its own earlier skills", async () => {
    rpc.run.mockResolvedValueOnce(answer("windows-toast"));
    const run = await mount(TOAST_PROMPT);
    await run();
    draft = "$windows-toast Grill me on my idea for a habit tracker app";
    rpc.run.mockResolvedValueOnce(answer("grilling"));
    await run();
    expect(draft).toBe("$grilling Grill me on my idea for a habit tracker app");
  });

  it("keeps skills the user typed", async () => {
    rpc.run.mockResolvedValue(answer("windows-toast"));
    await (
      await mount(`$archify ${TOAST_PROMPT}`)
    )();
    expect(draft).toBe(`$windows-toast $archify ${TOAST_PROMPT}`);
  });

  it("falls back to keywords, and says so, when the model cannot answer", async () => {
    rpc.run.mockResolvedValue({ _tag: "Success", value: { picks: [], modelUsed: false } });
    await (
      await mount(TOAST_PROMPT)
    )();
    expect(draft).toBe(`$windows-toast ${TOAST_PROMPT}`);
    expect(lastToast().description).toContain("keywords");
  });

  it("uses keywords without calling the model when there is no project folder", async () => {
    await (
      await mount(TOAST_PROMPT, null)
    )();
    expect(rpc.run).not.toHaveBeenCalled();
    expect(draft).toBe(`$windows-toast ${TOAST_PROMPT}`);
  });

  it("leaves the draft alone when no skill fits", async () => {
    await (
      await mount("thanks, looks good")
    )();
    expect(setPrompt).not.toHaveBeenCalled();
    expect(lastToast().title).toBe("No skills added");
    expect(lastToast().description).toContain("Use Skills to add one yourself");
  });

  it("does not overwrite text typed while the model was thinking", async () => {
    let finish!: (value: unknown) => void;
    rpc.run.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await mount(TOAST_PROMPT);
    let first!: Promise<void>;
    await act(async () => void (first = picker.pick()));
    draft = `${TOAST_PROMPT} please`;
    await act(async () => {
      finish(answer("windows-toast"));
      await first;
    });
    expect(setPrompt).not.toHaveBeenCalled();
    expect(lastToast().title).toBe("Your message changed");
  });
});

describe("which model picked, and no-skill pop-up", () => {
  it("names the engine that picked, and says a free model is free", async () => {
    rpc.run.mockResolvedValue({
      _tag: "Success",
      value: {
        picks: [{ name: "windows-toast", reason: "fits" }],
        modelUsed: true,
        engine: "openrouter",
        model: "openrouter/free",
      },
    });
    await (
      await mount(TOAST_PROMPT)
    )();
    expect(lastToast().description).toBe("$windows-toast (fits). Picked by OpenRouter free model.");
  });

  it("says the check ran, and how many skills it looked at, when the model picks none", async () => {
    rpc.run.mockResolvedValue({ _tag: "Success", value: { picks: [], modelUsed: true } });
    await (
      await mount(TOAST_PROMPT)
    )();
    expect(setPrompt).not.toHaveBeenCalled();
    expect(lastToast().title).toBe("No skills added");
    expect(lastToast().description).toMatch(/^Checked \d+ skills?\. None fits this message well\./);
  });

  it("sends the engine and model ids with the request", async () => {
    rpc.run.mockResolvedValue(answer("windows-toast"));
    await (
      await mount(TOAST_PROMPT, "/project", "groq")
    )();
    expect(rpc.run.mock.calls[0]![0].input).toMatchObject({
      engine: "groq",
      openRouterModel: "openrouter/free",
      groqModel: "qwen/qwen3.8-27b",
      localModel: "",
    });
  });

  it("keywords only calls no model and does not blame a missing model", async () => {
    await (
      await mount(TOAST_PROMPT, "/project", "keyword")
    )();
    expect(rpc.run).not.toHaveBeenCalled();
    expect(draft).toBe(`$windows-toast ${TOAST_PROMPT}`);
    expect(lastToast().description).toBe("$windows-toast");
  });

  it("points to Settings when no model answered in automatic mode", async () => {
    rpc.run.mockResolvedValue({ _tag: "Success", value: { picks: [], modelUsed: false } });
    await (
      await mount(TOAST_PROMPT)
    )();
    expect(lastToast().description).toContain("Set up a free model in Settings");
  });
});

describe("double run", () => {
  it("asks the model once and reports busy meanwhile", async () => {
    let finish!: (value: unknown) => void;
    rpc.run.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await mount(TOAST_PROMPT);
    let first!: Promise<void>;
    await act(async () => void (first = picker.pick()));
    await act(async () => picker.pick());
    expect(rpc.run).toHaveBeenCalledTimes(1);
    expect(picker.busy).toBe(true);
    await act(async () => {
      finish(answer("windows-toast"));
      await first;
    });
    expect(picker.busy).toBe(false);
  });
});

describe("typing nudge", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("appears after a pause on a draft a skill fits, and goes when the text changes", async () => {
    await mount(TOAST_PROMPT);
    expect(picker.nudge).toBe(false);
    await act(async () => void vi.advanceTimersByTime(1_600));
    expect(picker.nudge).toBe(true);
    await mount("Something else entirely that no skill here covers at all");
    expect(picker.nudge).toBe(false);
  });

  it("stays away from a short draft, a draft that has skills, and a draft nothing fits", async () => {
    for (const prompt of [
      "desktop toast",
      `$windows-toast ${TOAST_PROMPT}`,
      "Something else entirely that no skill here covers at all",
    ]) {
      await mount(prompt);
      await act(async () => void vi.advanceTimersByTime(3_000));
      expect(picker.nudge, prompt).toBe(false);
    }
  });
});

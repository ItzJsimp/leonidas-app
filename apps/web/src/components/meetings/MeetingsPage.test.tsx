// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  discord: { configured: true, connected: true, user: { username: "Jake" } } as unknown,
  call: vi.fn(),
}));

vi.mock("~/state/environments", () => ({ usePrimaryEnvironmentId: () => "env" }));
vi.mock("../twoState/WindowHeader", () => ({ WindowHeader: () => null }));
vi.mock("./useMeetingsCall", () => ({ useMeetingsCall: () => mocks.call }));

import { MeetingsPage } from "./MeetingsPage";

const item = {
  id: "a",
  title: "Weekly sync",
  started: new Date().toISOString(),
  durationMs: 600_000,
  state: "done",
  app: "Discord",
  people: ["Jake"],
  hasTranscript: true,
  hasAudio: false,
  pinned: false,
  notesState: "done",
};
const detail = {
  ...item,
  folder: "C:/meetings/a",
  note: {
    summary: ["We agreed on the plan."],
    decisions: [],
    action_items: [],
    open_questions: [],
  },
  transcript: [{ speaker_key: "Jake", t0: 5, text: "Hello there." }],
};

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.call.mockImplementation(async (_method: string, path: string) => {
    if (path === "") return { ok: true, value: { items: [item] } };
    if (path === "discord") return { ok: true, value: mocks.discord };
    if (path === "a") return { ok: true, value: detail };
    return { ok: true, value: {} };
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function show() {
  await act(async () => root.render(<MeetingsPage />));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const text = () => container.textContent ?? "";
const tab = (name: string) =>
  [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (el) => el.textContent === name,
  );

describe("MeetingsPage", () => {
  it("shows Summary first and the transcript on its own tab", async () => {
    await show();
    expect(tab("summary")?.getAttribute("aria-selected")).toBe("true");
    expect(text()).toContain("We agreed on the plan.");
    expect(text()).not.toContain("Hello there.");

    await act(async () => tab("transcript")?.click());
    expect(text()).toContain("Hello there.");
    expect(text()).not.toContain("We agreed on the plan.");
  });

  it("has one Copy button instead of three", async () => {
    await show();
    const labels = [...container.querySelectorAll("button")].map((el) => el.textContent);
    expect(labels.filter((label) => label?.includes("Copy"))).toEqual(["Copy"]);
  });

  it("shows the list with a drag handle to resize it", async () => {
    await show();
    expect(container.querySelector('nav [role="separator"]')).not.toBeNull();
  });

  it("shows the Discord step as done without asking for the keys again", async () => {
    await show();
    expect(text()).toContain("Discord names are on (connected as Jake)");
    expect(container.querySelector('input[aria-label="Discord client ID"]')).toBeNull();
  });

  it("still asks for the keys when Discord is not set up", async () => {
    mocks.discord = { configured: false, connected: false };
    await show();
    expect(text()).toContain("Show real names from Discord calls");
    expect(container.querySelector('input[aria-label="Discord client ID"]')).not.toBeNull();
    mocks.discord = { configured: true, connected: true, user: { username: "Jake" } };
  });
});

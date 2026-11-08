// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  discord: { configured: true, connected: true, user: { username: "Jake" } } as unknown,
  call: vi.fn(),
  items: [] as unknown[],
  templatesFail: false,
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
  mocks.items = [item];
  mocks.templatesFail = false;
  mocks.call.mockReset();
  mocks.call.mockImplementation(async (_method: string, path: string) => {
    if (path === "") return { ok: true, value: { items: mocks.items } };
    if (path === "templates")
      return mocks.templatesFail
        ? { ok: false, message: "The engine is not available." }
        : {
            ok: true,
            value: {
              items: [
                { id: "default", name: "Standard notes" },
                { id: "brainstorm", name: "Brainstorm" },
              ],
            },
          };
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

async function confirmNotes() {
  const write = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (el) => el.textContent === "Write notes again",
  );
  await act(async () => write?.click());
  const confirm = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'),
  ].find((el) => el.textContent === "Write notes");
  await act(async () => confirm?.click());
}

describe("MeetingsPage", () => {
  it("refreshes notes when a same-template run finishes before the next poll", async () => {
    let updated = false;
    const original = mocks.call.getMockImplementation()!;
    mocks.call.mockImplementation(async (method: string, path: string, body: unknown) => {
      if (method === "POST" && path === "a/summary") {
        updated = true;
        return { ok: true, value: {} };
      }
      if (path === "a" && updated)
        return {
          ok: true,
          value: { ...detail, note: { ...detail.note, summary: ["Updated meeting notes."] } },
        };
      return original(method, path, body);
    });
    await show();
    await confirmNotes();
    expect(text()).toContain("Updated meeting notes.");
    expect(text()).not.toContain("We agreed on the plan.");
  });

  it("keeps saved notes when writing notes fails", async () => {
    const original = mocks.call.getMockImplementation()!;
    mocks.call.mockImplementation(async (method: string, path: string, body: unknown) =>
      method === "POST" && path === "a/summary"
        ? { ok: false, message: "The engine is not available." }
        : original(method, path, body),
    );
    await show();
    await confirmNotes();
    expect(text()).toContain("We agreed on the plan.");
  });

  it("moves keyboard focus into the narrow reader and back to the selected meeting", async () => {
    vi.stubGlobal("innerWidth", 390);
    await show();
    const row = container.querySelector<HTMLButtonElement>('nav button[aria-current="true"]');
    await act(async () => {
      row?.focus();
      row?.click();
    });
    const back = container.querySelector<HTMLButtonElement>(
      'button[title="Back to the Meetings list."]',
    );
    expect(document.activeElement).toBe(back);
    await act(async () => back?.click());
    expect(document.activeElement).toBe(row);
  });
  it("selects a template without writing notes, then sends it with Write notes again", async () => {
    await show();
    const picker = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Notes template: Standard notes"]',
    );
    expect(picker).not.toBeNull();
    await act(async () => picker?.click());
    const choice = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
      (el) => el.textContent?.includes("Brainstorm"),
    );
    expect(choice).toBeDefined();
    await act(async () => choice?.click());
    expect(mocks.call.mock.calls.filter(([method]) => method === "POST")).toEqual([]);
    const write = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (el) => el.textContent === "Write notes again",
    );
    await act(async () => write?.click());
    expect(mocks.call.mock.calls.filter(([method]) => method === "POST")).toEqual([]);
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
      "Estimated cost: $0",
    );
    const confirm = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'),
    ].find((el) => el.textContent === "Write notes");
    await act(async () => confirm?.click());
    expect(mocks.call).toHaveBeenCalledWith("POST", "a/summary", { template: "brainstorm" });
  });

  it("lets the user retry loading templates without hiding saved notes", async () => {
    mocks.templatesFail = true;
    await show();
    expect(text()).toContain("We agreed on the plan.");
    expect(text()).toContain("Templates could not load.");
    mocks.templatesFail = false;
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (el) => el.textContent === "Retry templates",
    );
    await act(async () => retry?.click());
    expect(
      container.querySelector('button[aria-label="Notes template: Standard notes"]'),
    ).not.toBeNull();
  });
  it("filters meetings and restores them with Clear filters", async () => {
    mocks.items = [item, { ...item, id: "b", title: "Client call", app: "Zoom", pinned: true }];
    await show();
    const button = (name: string) =>
      [...container.querySelectorAll<HTMLButtonElement>("nav button")].find((el) =>
        el.textContent?.startsWith(name),
      );
    expect(text()).toContain("Client call");
    await act(async () => button("Discord")?.click());
    expect(text()).not.toContain("Client call");
    await act(async () => button("Kept audio")?.click());
    expect(text()).toContain("No meetings match");
    await act(async () => button("Clear filters")?.click());
    expect(text()).toContain("Client call");
    expect(button("All")?.getAttribute("aria-pressed")).toBe("true");
  });
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

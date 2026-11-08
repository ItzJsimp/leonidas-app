// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { CapEditor } from "./CapEditor";

const run = vi.hoisted(() => vi.fn());
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => run }));
vi.mock("~/state/taskBoard", () => ({ taskBoardCapSet: {} }));
vi.mock("~/components/workspace/aiosWorkspaceStore", () => ({ activeWorkspaceId: () => "ws-1" }));
vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  isAtomCommandInterrupted: () => false,
  squashAtomCommandFailure: (result: { message: string }) => result,
}));

let container: HTMLDivElement;
let root: Root;
const onSaved = vi.fn();
const flush = () => act(async () => undefined);

function mount(props: { saveOn: "button" | "commit"; open?: number }) {
  return act(async () =>
    root.render(
      <CapEditor
        environmentId={"env-1" as never}
        projectSlug="demo"
        cap={20}
        warn={12}
        open={props.open ?? 3}
        saveOn={props.saveOn}
        onSaved={onSaved}
      />,
    ),
  );
}

const input = (label: string) =>
  container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const button = (text: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;

// Base UI reads the field through React's change event, so set the value the way a browser does.
function type(label: string, value: string) {
  return act(async () => {
    const field = input(label);
    field.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  run.mockReset().mockResolvedValue({ _tag: "Success", value: undefined });
  onSaved.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("CapEditor with a Save button", () => {
  it("sends the typed numbers when the form is submitted, which is what Enter does", async () => {
    await mount({ saveOn: "button" });
    expect(button("Save").disabled).toBe(true);
    await type("Limit", "25");
    await type("Warn at", "15");
    expect(button("Save").disabled).toBe(false);
    await act(async () => container.querySelector("form")!.requestSubmit());
    expect(run).toHaveBeenCalledWith({
      environmentId: "env-1",
      input: expect.objectContaining({ projectSlug: "demo", cap: 25, warn: 15 }),
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["zero", "Limit", "0", "The limit must be from 1 to 9999."],
    ["a warning above the limit", "Warn at", "21", "The warning must be from 0 up to the limit."],
  ])("refuses %s with a plain message and sends nothing", async (_name, label, value, message) => {
    await mount({ saveOn: "button" });
    await type(label, value);
    await act(async () => container.querySelector("form")!.requestSubmit());
    expect(run).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("shows the server's message when the save fails", async () => {
    run.mockResolvedValue({ _tag: "Failure", message: "Could not write project.md." });
    await mount({ saveOn: "button" });
    await type("Limit", "25");
    await act(async () => container.querySelector("form")!.requestSubmit());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Could not write project.md.",
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("warns, without blocking, when the limit is below the open count", async () => {
    await mount({ saveOn: "button", open: 14 });
    await type("Limit", "10");
    await type("Warn at", "5");
    expect(container.textContent).toContain("14 tasks are open, so this project shows as full");
    await act(async () => container.querySelector("form")!.requestSubmit());
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ cap: 10, warn: 5 }) }),
    );
  });

  it("resets to the default limit and warning in one click", async () => {
    await mount({ saveOn: "button" });
    await act(async () => button("Reset to default").click());
    await flush();
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ cap: 50, warn: 30 }) }),
    );
  });
});

describe("CapEditor that saves as you leave a field", () => {
  it("has no Save button and saves when a field loses focus", async () => {
    await mount({ saveOn: "commit" });
    expect(container.querySelector("form")).toBeNull();
    expect(button("Save")).toBeUndefined();
    await type("Limit", "30");
    expect(run).not.toHaveBeenCalled();
    await act(async () => input("Limit").blur());
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ cap: 30, warn: 12 }) }),
    );
  });

  it("saves on Enter by leaving the field", async () => {
    await mount({ saveOn: "commit" });
    await type("Warn at", "8");
    await act(async () => {
      input("Warn at").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ cap: 20, warn: 8 }) }),
    );
  });

  it("refuses a bad value on leaving the field and writes nothing", async () => {
    await mount({ saveOn: "commit" });
    await type("Warn at", "40");
    await act(async () => input("Warn at").blur());
    expect(run).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "The warning must be from 0 up to the limit.",
    );
  });
});

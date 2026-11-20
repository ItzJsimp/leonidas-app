// @vitest-environment jsdom
import type { DesktopSnipResult, ServerProviderSkill } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock("../ui/toast", () => ({ toastManager: toast }));

import { useFocusWidgetStore } from "../focus/focusWidgetStore";
import { ComposerPlusMenu } from "./ComposerPlusMenu";
import { useDesktopSnips } from "./ComposerSnipButton";

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";
const listRecentSnips = vi.fn();
const readSnip = vi.fn<(path: string) => Promise<DesktopSnipResult>>();
const openSnipsFolder = vi.fn();
const skill: ServerProviderSkill = {
  name: "grilling",
  description: "Grill the user about a plan",
  path: "/skills/grilling/SKILL.md",
  enabled: true,
};
const pick = vi.fn();

let root: Root;
let host: HTMLDivElement;

function stubDesktop(withBridge = true) {
  Object.defineProperty(window, "navigator", { value: { platform: "Win32" }, configurable: true });
  Object.defineProperty(window, "desktopBridge", {
    configurable: true,
    value: withBridge
      ? { startSnip: vi.fn(), listRecentSnips, readSnip, openSnipsFolder }
      : undefined,
  });
}

function Harness(props: {
  onSnip: (file: File) => void;
  onAttach?: () => void;
  skills?: ServerProviderSkill[];
}) {
  const snips = useDesktopSnips(props.onSnip);
  return (
    <ComposerPlusMenu
      onAttach={props.onAttach ?? vi.fn()}
      attachShortcutLabel={null}
      snips={snips}
      skills={props.skills ?? []}
      onSelectSkill={vi.fn()}
      autoPick={{ pick, busy: false, hasText: true, nudge: false }}
      renderLibrary={() => <p>library panel</p>}
    />
  );
}

const wait = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));
async function openMenu(props: Parameters<typeof Harness>[0]) {
  await act(async () => {
    root.render(<Harness {...props} />);
  });
  const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="Add to your message"]');
  expect(trigger).not.toBeNull();
  await act(async () => {
    trigger?.click();
    await wait();
  });
}
function menuItem(text: string): HTMLElement | undefined {
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
    item.textContent?.includes(text),
  );
}
const clickItem = (text: string) =>
  act(async () => {
    menuItem(text)?.click();
    await wait(30);
  });

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  listRecentSnips.mockReset();
  readSnip.mockReset();
  openSnipsFolder.mockReset();
  pick.mockReset();
  toast.add.mockReset();
  useFocusWidgetStore.getState().setVisible(false);
  stubDesktop();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("lists the three newest snips and attaches the one the user picks", async () => {
  listRecentSnips.mockResolvedValue(
    [4, 3, 2, 1].map((n) => ({
      name: `snip-${n}.png`,
      path: `C:/snips/snip-${n}.png`,
      modifiedMs: n,
      dataUrl: "",
    })),
  );
  readSnip.mockResolvedValue({
    status: "saved",
    path: "C:/snips/snip-4.png",
    name: "snip-4.png",
    width: 10,
    height: 10,
    dataUrl: PNG_DATA_URL,
  });
  const onSnip = vi.fn();
  await openMenu({ onSnip });
  expect(listRecentSnips).toHaveBeenCalledTimes(1);
  expect(menuItem("snip-2.png")).toBeDefined();
  expect(menuItem("snip-1.png")).toBeUndefined();
  await clickItem("snip-4.png");
  expect(readSnip).toHaveBeenCalledWith("C:/snips/snip-4.png");
  expect(onSnip).toHaveBeenCalledTimes(1);
});

it("says there are no snips yet and View all opens the folder", async () => {
  listRecentSnips.mockResolvedValue([]);
  openSnipsFolder.mockResolvedValue(undefined);
  await openMenu({ onSnip: vi.fn() });
  expect(menuItem("No snips yet. Take a snip to see it here.")).toBeDefined();
  await clickItem("View all");
  expect(openSnipsFolder).toHaveBeenCalledTimes(1);
});

it("shows a plain error when the recent list cannot load", async () => {
  listRecentSnips.mockRejectedValue(new Error("Could not list your recent snips."));
  await openMenu({ onSnip: vi.fn() });
  expect(toast.add).toHaveBeenCalledWith(
    expect.objectContaining({ type: "error", title: "Could not list your recent snips" }),
  );
});

it("leaves out snips outside the desktop app", async () => {
  stubDesktop(false);
  await openMenu({ onSnip: vi.fn() });
  expect(document.body.textContent).not.toContain("Recent snips");
  expect(menuItem("Attach files")).toBeDefined();
});

it("attaches files, opens the prompt library and toggles the notepad", async () => {
  listRecentSnips.mockResolvedValue([]);
  const onAttach = vi.fn();
  await openMenu({ onSnip: vi.fn(), onAttach });
  await clickItem("Attach files");
  expect(onAttach).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).not.toContain("library panel");
  expect(useFocusWidgetStore.getState().visible).toBe(false);

  await openMenu({ onSnip: vi.fn(), onAttach });
  await clickItem("Prompt library");
  expect(document.body.textContent).toContain("library panel");

  await openMenu({ onSnip: vi.fn(), onAttach });
  await clickItem("Show notepad");
  expect(useFocusWidgetStore.getState().visible).toBe(true);
});

it("offers the skill items only when the agent has skills, and auto-pick runs the pick", async () => {
  listRecentSnips.mockResolvedValue([]);
  await openMenu({ onSnip: vi.fn() });
  expect(menuItem("Auto-pick skills")).toBeUndefined();
  await act(async () =>
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );

  await openMenu({ onSnip: vi.fn(), skills: [skill] });
  expect(menuItem("Skills")).toBeDefined();
  await clickItem("Auto-pick skills");
  expect(pick).toHaveBeenCalledTimes(1);
});

it("keeps composer focus without cancelling the pointer events a menu opens on", async () => {
  listRecentSnips.mockResolvedValue([]);
  await act(async () => {
    root.render(<Harness onSnip={vi.fn()} />);
  });
  const trigger = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Add to your message"]',
  )!;
  const fire = (event: Event) => trigger.dispatchEvent(event);
  const init = { bubbles: true, cancelable: true };
  // A cancelled pointerdown makes Chromium skip mousedown, and the menu opens on mousedown.
  expect(fire(new PointerEvent("pointerdown", init))).toBe(true);
  // A cancelled mousedown keeps focus in the composer.
  expect(fire(new MouseEvent("mousedown", init))).toBe(false);
});

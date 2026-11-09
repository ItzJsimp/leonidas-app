// @vitest-environment jsdom
import type { DesktopSnipResult } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock("../ui/toast", () => ({ toastManager: toast }));

import { ComposerSnipButton } from "./ComposerSnipButton";

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";
let root: Root;
let host: HTMLDivElement;
const startSnip = vi.fn<() => Promise<DesktopSnipResult>>();
const listRecentSnips = vi.fn();
const readSnip = vi.fn<(path: string) => Promise<DesktopSnipResult>>();
const openSnipsFolder = vi.fn();

function stubDesktop(platform: string, withBridge = true) {
  vi.stubGlobal("navigator", { platform });
  Object.defineProperty(window, "navigator", { value: { platform }, configurable: true });
  Object.defineProperty(window, "desktopBridge", {
    configurable: true,
    value: withBridge
      ? {
          startSnip,
          listRecentSnips,
          readSnip,
          openSnipsFolder,
        }
      : undefined,
  });
}

async function render(onSnip: (file: File) => void) {
  await act(async () => {
    root.render(<ComposerSnipButton onSnip={onSnip} />);
  });
}

async function clickSnip() {
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Snip the screen"]');
  expect(button).not.toBeNull();
  await act(async () => {
    button?.click();
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  startSnip.mockReset();
  listRecentSnips.mockReset();
  readSnip.mockReset();
  openSnipsFolder.mockReset();
  toast.add.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("attaches the saved snip as a PNG file", async () => {
  stubDesktop("Win32");
  startSnip.mockResolvedValue({
    status: "saved",
    path: "C:/snips/snip-1.png",
    name: "snip-1.png",
    width: 10,
    height: 10,
    dataUrl: PNG_DATA_URL,
  });
  const onSnip = vi.fn();
  await render(onSnip);
  await clickSnip();
  expect(startSnip).toHaveBeenCalledTimes(1);
  expect(onSnip).toHaveBeenCalledTimes(1);
  const file = onSnip.mock.calls[0]?.[0] as File;
  expect(file.name).toBe("snip-1.png");
  expect(file.type).toBe("image/png");
});

it("attaches nothing when the user cancels", async () => {
  stubDesktop("Win32");
  startSnip.mockResolvedValue({ status: "cancelled" });
  const onSnip = vi.fn();
  await render(onSnip);
  await clickSnip();
  expect(onSnip).not.toHaveBeenCalled();
  expect(toast.add).not.toHaveBeenCalled();
});

it("shows a plain error when the capture fails", async () => {
  stubDesktop("Win32");
  startSnip.mockRejectedValue(new Error("Could not capture the screen."));
  const onSnip = vi.fn();
  await render(onSnip);
  await clickSnip();
  expect(onSnip).not.toHaveBeenCalled();
  expect(toast.add).toHaveBeenCalledWith(
    expect.objectContaining({ type: "error", description: "Could not capture the screen." }),
  );
});

it("renders nothing outside the Windows and macOS desktop apps", async () => {
  stubDesktop("Linux x86_64");
  await render(vi.fn());
  expect(host.querySelector("button")).toBeNull();
  stubDesktop("Win32", false);
  await render(vi.fn());
  expect(host.querySelector("button")).toBeNull();
  stubDesktop("MacIntel", false);
  await render(vi.fn());
  expect(host.querySelector("button")).toBeNull();
});

it("renders the button in the macOS desktop app", async () => {
  stubDesktop("MacIntel");
  await render(vi.fn());
  expect(host.querySelector("button")).not.toBeNull();
});

async function openRecentMenu() {
  const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="Recent snips"]');
  expect(trigger).not.toBeNull();
  await act(async () => {
    trigger?.click();
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

function menuItem(text: string): HTMLElement | undefined {
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
    item.textContent?.includes(text),
  );
}

it("lists recent snips and attaches the one the user picks", async () => {
  stubDesktop("Win32");
  listRecentSnips.mockResolvedValue([
    { name: "snip-2.png", path: "C:/snips/snip-2.png", modifiedMs: 2, dataUrl: "" },
    { name: "snip-1.png", path: "C:/snips/snip-1.png", modifiedMs: 1, dataUrl: "" },
  ]);
  readSnip.mockResolvedValue({
    status: "saved",
    path: "C:/snips/snip-2.png",
    name: "snip-2.png",
    width: 10,
    height: 10,
    dataUrl: PNG_DATA_URL,
  });
  const onSnip = vi.fn();
  await render(onSnip);
  await openRecentMenu();
  expect(listRecentSnips).toHaveBeenCalledTimes(1);
  const item = menuItem("snip-2.png");
  expect(item).toBeDefined();
  await act(async () => {
    item?.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(readSnip).toHaveBeenCalledWith("C:/snips/snip-2.png");
  expect(onSnip).toHaveBeenCalledTimes(1);
});

it("says there are no snips yet and still offers the folder", async () => {
  stubDesktop("Win32");
  listRecentSnips.mockResolvedValue([]);
  openSnipsFolder.mockResolvedValue(undefined);
  await render(vi.fn());
  await openRecentMenu();
  expect(menuItem("No snips yet. Take a snip to see it here.")).toBeDefined();
  await act(async () => {
    menuItem("Open snips folder")?.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(openSnipsFolder).toHaveBeenCalledTimes(1);
});

it("shows a plain error when the recent list cannot load", async () => {
  stubDesktop("Win32");
  listRecentSnips.mockRejectedValue(new Error("Could not list your recent snips."));
  await render(vi.fn());
  await openRecentMenu();
  expect(toast.add).toHaveBeenCalledWith(
    expect.objectContaining({ type: "error", title: "Could not list your recent snips" }),
  );
});

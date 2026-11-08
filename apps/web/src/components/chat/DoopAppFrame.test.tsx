// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { readDoopPreview } from "./doopPreview";

const mocks = vi.hoisted(() => ({ open: vi.fn(), detail: { data: undefined as unknown } }));
vi.mock("~/localApi", () => ({ readLocalApi: () => ({ shell: { openExternal: mocks.open } }) }));
vi.mock("~/state/queries", () => ({ useTurnItemDetail: () => mocks.detail }));
vi.mock("./ExpandedImageDialog", () => ({
  ExpandedImageDialog: () => <div role="dialog">Expanded preview</div>,
}));
import { DoopAppFrame, DoopCanvasPreview } from "./DoopAppFrame";

const preview = readDoopPreview({
  canvas: { id: "canvas-1", name: "Leonidas app" },
  frames: [
    {
      id: "phone",
      name: "Meetings · A narrow review",
      width: 390,
      height: 844,
      image_url: "https://doop.design/i/phone.png?scale=1",
    },
  ],
})!;
let root: Root;
let box: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.desktopBridge = {} as NonNullable<Window["desktopBridge"]>;
  mocks.open.mockReset().mockResolvedValue(undefined);
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(async () => {
  await act(async () => root.unmount());
  box.remove();
  delete window.desktopBridge;
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<DoopCanvasPreview preview={preview} />));
}
async function click(text: string) {
  const button = Array.from(box.querySelectorAll("button")).find((b) => b.textContent === text)!;
  await act(async () => button.click());
}
describe("Doop cards", () => {
  it("launches the desktop app and keeps the exact browser destination", async () => {
    await render();
    await click("Open app");
    expect(mocks.open).toHaveBeenCalledWith("doop://open");
    expect(box.querySelector("a")?.href).toBe(preview.url);
    expect(box.textContent).toContain("Choose this canvas inside the app");
  });
  it("reports launch failure and keeps Browser available", async () => {
    mocks.open.mockRejectedValue(new Error("No application handler"));
    await render();
    await click("Open app");
    expect(box.querySelector('[role="alert"]')?.textContent).toContain("use Browser");
    expect(box.querySelector("a")?.href).toBe(preview.url);
  });
  it("enlarges a preview without opening a browser", async () => {
    await render();
    await act(async () =>
      (box.querySelector('[aria-label^="Enlarge"]') as HTMLButtonElement).click(),
    );
    expect(box.querySelector('[role="dialog"]')).not.toBeNull();
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("replaces a failed image with a link without automatic retries", async () => {
    await render();
    await act(async () => box.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(box.querySelector("img")).toBeNull();
    expect(box.textContent).toContain("Preview unavailable");
    expect(
      Array.from(box.querySelectorAll("a")).find((a) => a.textContent === "View design")?.href,
    ).toBe(preview.frames[0]!.url);
  });
  it("omits the app launcher in browser clients", async () => {
    delete window.desktopBridge;
    await render();
    expect(box.textContent).not.toContain("Open app");
    expect(box.querySelector("a")?.textContent).toBe("Browser");
  });
  it("reads the stored tool result used by historical cards", async () => {
    mocks.detail.data = {
      item: {
        type: "dynamic_tool",
        output: {
          result: {
            structuredContent: {
              canvas: { id: "canvas-1", name: "Historical canvas" },
              frames: [],
            },
          },
        },
      },
    };
    await act(async () =>
      root.render(
        <DoopAppFrame
          environmentId={"env" as never}
          threadId={"thread" as never}
          itemId={"item" as never}
          revision="1"
        />,
      ),
    );
    expect(box.textContent).toContain("Historical canvas");
    expect(box.textContent).toContain("This canvas has no designs yet");
  });
});

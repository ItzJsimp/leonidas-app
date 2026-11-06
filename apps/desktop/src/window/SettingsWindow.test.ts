import * as NodeEvents from "node:events";
import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vite-plus/test";
import { installSettingsWindowSupport, isSettingsWindowRequest } from "./SettingsWindow.ts";

describe("settings window requests", () => {
  it.each([
    ["t3code://app/settings/general?machine=local#theme", "leonidas-settings", true],
    ["t3code://other/settings", "leonidas-settings", false],
    ["https://example.com/settings", "leonidas-settings", false],
    ["t3code://app/chat", "leonidas-settings", false],
    ["invalid", "leonidas-settings", false],
    ["t3code://app/settings", "other-window", false],
  ])("checks settings target %s and window name %s", (url, name, allowed) => {
    expect(isSettingsWindowRequest("t3code://app/", url, name)).toBe(allowed);
  });
  it.each([3000, 3001])("checks the dev server port %s", (port) => {
    expect(
      isSettingsWindowRequest(
        "http://localhost:3000/",
        `http://localhost:${port}/settings`,
        "leonidas-settings",
      ),
    ).toBe(port === 3000);
  });
  it("releases popup lifecycle listeners across repeated open and close cycles", () => {
    const main = Object.assign(new NodeEvents.EventEmitter(), {
      webContents: Object.assign(new NodeEvents.EventEmitter(), { setWindowOpenHandler: vi.fn() }),
    });
    const openExternal = vi.fn();
    installSettingsWindowSupport(
      main as unknown as BrowserWindow,
      "t3code://app/",
      "/preload.js",
      "Leonidas",
      openExternal,
    );
    const before = main.listenerCount("closed");
    for (let i = 0; i < 20; i++) {
      const popup = Object.assign(new NodeEvents.EventEmitter(), {
        webContents: Object.assign(new NodeEvents.EventEmitter(), {
          setWindowOpenHandler: vi.fn(),
        }),
        isDestroyed: () => false,
        close: vi.fn(),
      });
      main.webContents.emit("did-create-window", popup);
      expect(main.listenerCount("closed")).toBe(before + 1);
      popup.emit("closed");
      expect(main.listenerCount("closed")).toBe(before);
    }
    expect(main.webContents.listenerCount("did-create-window")).toBe(1);
  });
});

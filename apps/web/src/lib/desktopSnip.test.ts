import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { getDesktopSnipBridge } from "./desktopSnip";

const bridge = {
  startSnip: () => {},
  listRecentSnips: () => {},
  readSnip: () => {},
  openSnipsFolder: () => {},
};
const stubWindow = (platform: string, desktopBridge: object | undefined) =>
  vi.stubGlobal("window", { navigator: { platform }, desktopBridge });

afterEach(() => vi.unstubAllGlobals());

describe("getDesktopSnipBridge", () => {
  it("is available in the desktop app on Windows and macOS", () => {
    stubWindow("Win32", bridge);
    expect(getDesktopSnipBridge()).toBe(bridge);
    stubWindow("MacIntel", bridge);
    expect(getDesktopSnipBridge()).toBe(bridge);
  });

  it("stays hidden on Linux and in a plain browser", () => {
    stubWindow("Linux x86_64", bridge);
    expect(getDesktopSnipBridge()).toBeUndefined();
    stubWindow("MacIntel", undefined);
    expect(getDesktopSnipBridge()).toBeUndefined();
  });

  it("stays hidden when the desktop app is too old to have every snip method", () => {
    stubWindow("MacIntel", { startSnip: () => {} });
    expect(getDesktopSnipBridge()).toBeUndefined();
  });
});

import type { DesktopBridge, DesktopSnipResult } from "@t3tools/contracts";

import { dataUrlToFile } from "./imageCompression";
import { isMacPlatform, isWindowsPlatform } from "./utils";

type SnipMethods = "startSnip" | "listRecentSnips" | "readSnip" | "openSnipsFolder";

export type DesktopSnipBridge = DesktopBridge & Required<Pick<DesktopBridge, SnipMethods>>;

/** The snip tool needs the desktop app on Windows or macOS. */
export function getDesktopSnipBridge(): DesktopSnipBridge | undefined {
  if (typeof window === "undefined") return undefined;
  const platform = window.navigator.platform;
  if (!isWindowsPlatform(platform) && !isMacPlatform(platform)) return undefined;
  const bridge = window.desktopBridge;
  if (
    typeof bridge?.startSnip !== "function" ||
    typeof bridge.listRecentSnips !== "function" ||
    typeof bridge.readSnip !== "function" ||
    typeof bridge.openSnipsFolder !== "function"
  ) {
    return undefined;
  }
  return bridge as DesktopSnipBridge;
}

/** Turns a saved snip into a file for the composer. A cancelled snip gives null. */
export function snipResultToFile(result: DesktopSnipResult): File | null {
  if (result.status !== "saved") return null;
  return dataUrlToFile(result.dataUrl, result.name, "image/png");
}

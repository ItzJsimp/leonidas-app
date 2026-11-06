// @effect-diagnostics globalDate:off -- The file name needs local calendar fields, read once at the Electron boundary.
// @effect-diagnostics nodeBuiltinImport:off -- This desktop-only module writes snips to disk.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import * as Electron from "electron";

import { MAC_PERMISSION_SETTINGS_URLS } from "../permissions/MacPermission.ts";
import type { SnipFrame } from "./SnipCompose.ts";
import type { SnipDisplay } from "./SnipGeometry.ts";

export function readSnipDisplays(): ReadonlyArray<SnipDisplay> {
  return Electron.screen.getAllDisplays().map((display) => ({
    id: display.id,
    dipBounds: display.bounds,
    physicalBounds: Electron.screen.dipToScreenRect(null, display.bounds),
    scaleFactor: display.scaleFactor,
  }));
}

/** Captures each display at its true physical size, one call per distinct size, in parallel. */
export async function captureSnipFrames(
  displays: ReadonlyArray<SnipDisplay>,
): Promise<ReadonlyMap<number, SnipFrame>> {
  const bySize = new Map<string, SnipDisplay[]>();
  for (const display of displays) {
    const key = `${String(display.physicalBounds.width)}x${String(display.physicalBounds.height)}`;
    bySize.set(key, [...(bySize.get(key) ?? []), display]);
  }
  const groups = await Promise.all(
    [...bySize.values()].map(async (group) => {
      const first = group[0];
      if (!first) return [];
      const sources = await Electron.desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: first.physicalBounds.width, height: first.physicalBounds.height },
      });
      const captured: Array<readonly [number, SnipFrame]> = [];
      for (const display of group) {
        const source = sources.find((candidate) => candidate.display_id === String(display.id));
        if (!source || source.thumbnail.isEmpty()) continue;
        const size = source.thumbnail.getSize();
        captured.push([
          display.id,
          { width: size.width, height: size.height, bgra: source.thumbnail.toBitmap() },
        ]);
      }
      return captured;
    }),
  );
  return new Map(groups.flat());
}

export function encodeSnipPng(frame: SnipFrame): Buffer {
  return Electron.nativeImage
    .createFromBitmap(frame.bgra, { width: frame.width, height: frame.height })
    .toPNG();
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** `snip-20261016-173045-123.png`, in local time so the name matches the user's clock. */
function snipFileName(date: Date): string {
  const day = `${String(date.getFullYear())}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `snip-${day}-${time}-${pad(date.getMilliseconds(), 3)}.png`;
}

export async function saveSnipPng(
  directory: string,
  png: Buffer,
  nowMs: number,
): Promise<{ readonly path: string; readonly name: string }> {
  await NodeFSP.mkdir(directory, { recursive: true });
  const name = snipFileName(new Date(nowMs));
  const path = NodePath.join(directory, name);
  await NodeFSP.writeFile(path, png, { flag: "wx" });
  return { path, name };
}

const THUMBNAIL_WIDTH_PX = 160;

/** A small data URL for the Recent snips list. Empty when the file cannot be decoded. */
export function snipThumbnailDataUrl(path: string): string {
  const image = Electron.nativeImage.createFromPath(path);
  if (image.isEmpty()) return "";
  const width = Math.min(THUMBNAIL_WIDTH_PX, image.getSize().width);
  return image.resize({ width, quality: "good" }).toDataURL();
}

/** Reads a saved snip back as a full image. Returns null when the file is not a readable image. */
export async function readSnipImage(
  path: string,
): Promise<{ readonly width: number; readonly height: number; readonly dataUrl: string } | null> {
  const png = await NodeFSP.readFile(path).catch(() => null);
  if (!png) return null;
  const size = Electron.nativeImage.createFromBuffer(png).getSize();
  if (size.width === 0 || size.height === 0) return null;
  return {
    width: size.width,
    height: size.height,
    dataUrl: `data:image/png;base64,${png.toString("base64")}`,
  };
}

export async function openSnipsDirectory(directory: string): Promise<void> {
  await NodeFSP.mkdir(directory, { recursive: true });
  const failure = await Electron.shell.openPath(directory);
  if (failure.length > 0) throw new Error(failure);
}

/** True when macOS already refused screen recording for this app, or a policy blocks it. */
export function isMacScreenRecordingBlocked(): boolean {
  const status = Electron.systemPreferences.getMediaAccessStatus("screen");
  return status === "denied" || status === "restricted";
}

/** Opens System Settings at Screen Recording. Best effort: the error message tells the same path. */
export function openMacScreenRecordingSettings(): Promise<void> {
  return Electron.shell.openExternal(MAC_PERMISSION_SETTINGS_URLS["screen-recording"]);
}

export function snipPngSize(png: Buffer): { readonly width: number; readonly height: number } {
  return Electron.nativeImage.createFromBuffer(png).getSize();
}

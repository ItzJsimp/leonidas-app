// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_CLIENT_SETTINGS, type ClientSettingsPatch } from "@t3tools/contracts/settings";
const settings = vi.hoisted(() => ({
  value: {} as typeof DEFAULT_CLIENT_SETTINGS,
  update: vi.fn(),
}));
const toasts = vi.hoisted(() => ({ add: vi.fn(), close: vi.fn() }));
vi.mock("../../hooks/useSettings", () => ({
  useClientSettings: (select?: (s: typeof DEFAULT_CLIENT_SETTINGS) => unknown) =>
    select ? select(settings.value) : settings.value,
  useUpdateClientSettings: () => settings.update,
}));
vi.mock("../ui/toast", () => ({ toastManager: toasts }));
import {
  CacheNoticeCoordinator,
  CacheNoticeControls,
  useCacheActionWarning,
  cacheWaitNote,
} from "./CacheAwareness";
import {
  recentCacheChats,
  observeCacheChat,
  setCacheSessionSnooze,
} from "../../lib/cacheAwarenessStore";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  settings.value = { ...DEFAULT_CLIENT_SETTINGS, inAppNotificationsEnabled: true };
  settings.update.mockReset().mockImplementation(async (patch: ClientSettingsPatch) => {
    settings.value = { ...settings.value, ...patch };
  });
  toasts.add.mockReset();
  toasts.close.mockReset();
  recentCacheChats.clear();
  setCacheSessionSnooze(false);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});
function button(text: string) {
  const found = [...document.querySelectorAll("button")].find((x) => x.textContent === text);
  if (!found) throw new Error("Missing button: " + text);
  return found;
}
describe("cache controls", () => {
  it("requires confirmation, cancels safely, and persists category mute on continue", async () => {
    const action = vi.fn();
    function Harness() {
      const warning = useCacheActionWarning();
      return (
        <>
          {warning.dialog}
          <button
            onClick={() =>
              warning.run(
                {
                  category: "model",
                  confirmed: true,
                  message: "The new model needs its own cache.",
                },
                action,
              )
            }
          >
            Change model
          </button>
        </>
      );
    }
    await act(async () => root.render(<Harness />));
    await act(async () => button("Change model").click());
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(action).not.toHaveBeenCalled();
    await act(async () => button("Cancel").click());
    expect(action).not.toHaveBeenCalled();
    await act(async () => button("Change model").click());
    await act(async () => (document.querySelector('[role="checkbox"]') as HTMLElement).click());
    await act(async () => button("Continue").click());
    expect(action).toHaveBeenCalledTimes(1);
    expect(settings.value.cacheMutedWarnings).toContain("model");
    await act(async () => button("Change model").click());
    expect(action).toHaveBeenCalledTimes(2);
  });
  it("groups two recent chats once and does not send requests", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    for (const key of ["α space", "β"])
      observeCacheChat(
        key,
        {
          inputTokens: 100_000,
          cachedInputTokens: 90_000,
          reportedAt: now,
          anchorAt: now - 51 * 60_000,
          ttlMs: 3_600_000,
        },
        now,
      );
    await act(async () => root.render(<CacheNoticeCoordinator />));
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(toasts.add).toHaveBeenCalledTimes(1);
    expect(toasts.add.mock.calls[0]![0].title).toContain("2 chats");
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(toasts.add).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(host);
  });
  it("respects global mute and session snooze without hiding status data", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    observeCacheChat(
      "chat",
      {
        inputTokens: 50_000,
        cachedInputTokens: 45_000,
        reportedAt: now,
        anchorAt: now - 51 * 60_000,
        ttlMs: 3_600_000,
      },
      now,
    );
    setCacheSessionSnooze(true);
    await act(async () => root.render(<CacheNoticeCoordinator />));
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(toasts.add).not.toHaveBeenCalled();
    settings.value = { ...settings.value, cacheMutedWarnings: ["expiry"] };
    setCacheSessionSnooze(false);
    await act(async () => root.render(<CacheNoticeCoordinator />));
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(toasts.add).not.toHaveBeenCalled();
    expect(recentCacheChats.size).toBe(1);
  });
  it("offers a permanent expiry mute beside snooze", async () => {
    await act(async () => root.render(<CacheNoticeControls />));
    await act(async () => button("Don't remind again").click());
    expect(settings.value.cacheMutedWarnings).toContain("expiry");
  });
});

it("caps tracked chats and keeps the latest report when revisiting", () => {
  const now = Date.now();
  const observation = { reportedAt: now, cachedInputTokens: 100, inputTokens: 100 };
  for (let index = 0; index < 101; index += 1) observeCacheChat(String(index), observation, now);
  expect(recentCacheChats.size).toBe(100);
  expect(recentCacheChats.has("0")).toBe(false);
  observeCacheChat("1", { ...observation, cachedInputTokens: 50 }, now);
  expect(recentCacheChats.get("1")?.observation.cachedInputTokens).toBe(50);
  expect(recentCacheChats.size).toBe(100);
});

describe("cacheWaitNote", () => {
  const base = { readRate: 0.9 } as const;
  it("warns when the cache ended while a question waited", () => {
    const note = cacheWaitNote({ ...base, state: "possibly-expired", remainingMs: 0 }, true);
    expect(note).toContain("ended");
  });
  it("warns only inside the last 10 minutes", () => {
    expect(cacheWaitNote({ ...base, state: "estimated", remainingMs: 9 * 60_000 }, true)).toContain(
      "ends soon",
    );
    expect(
      cacheWaitNote({ ...base, state: "estimated", remainingMs: 40 * 60_000 }, true),
    ).toBeNull();
  });
  it("stays silent when nothing waits or the lifetime is unknown", () => {
    expect(cacheWaitNote({ ...base, state: "possibly-expired", remainingMs: 0 }, false)).toBeNull();
    expect(cacheWaitNote({ ...base, state: "reported", remainingMs: null }, true)).toBeNull();
  });
});

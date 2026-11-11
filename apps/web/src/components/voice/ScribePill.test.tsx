// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { formatPillTime, ScribePill } from "./ScribePill";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const status = () => document.body.querySelector('[role="status"]');

it("formats seconds as m:ss", () => {
  expect(formatPillTime(0)).toBe("0:00");
  expect(formatPillTime(65)).toBe("1:05");
});

it("shows the timer while listening and stops on click", () => {
  const onStop = vi.fn();
  act(() =>
    root.render(<ScribePill phase="listening" seconds={7} level={() => 0.4} onStop={onStop} />),
  );
  expect(status()?.textContent).toContain("0:07");
  act(() => status()?.querySelector("button")?.click());
  expect(onStop).toHaveBeenCalledTimes(1);
});

it("moves the level bars with the mic level", () => {
  let level = 0;
  act(() =>
    root.render(<ScribePill phase="listening" seconds={1} level={() => level} onStop={vi.fn()} />),
  );
  const heights = () =>
    [...document.body.querySelectorAll<HTMLElement>("[data-bar]")].map((bar) => bar.style.height);
  expect(new Set(heights())).toEqual(new Set(["4px"]));
  level = 1;
  act(() => vi.advanceTimersByTime(100));
  expect(heights().at(-1)).toBe("18px");
});

it("names the transcribing and pasted phases", () => {
  act(() =>
    root.render(<ScribePill phase="writing" seconds={3} level={() => 0} onStop={vi.fn()} />),
  );
  expect(status()?.textContent).toBe("Transcribing");
  act(() => root.render(<ScribePill phase="done" seconds={3} level={() => 0} onStop={vi.fn()} />));
  expect(status()?.textContent).toBe("Pasted");
});

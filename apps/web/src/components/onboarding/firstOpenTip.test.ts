// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vite-plus/test";

const toasts = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock("../ui/toast", () => ({ toastManager: toasts }));

import { showFirstOpenTip } from "./firstOpenTip";

beforeEach(() => {
  localStorage.clear();
  toasts.add.mockClear();
});

it("shows the matching basics card once per menu, then never again", () => {
  showFirstOpenTip("switch");
  showFirstOpenTip("switch");
  showFirstOpenTip("effort");
  expect(toasts.add).toHaveBeenCalledTimes(2);
  expect(toasts.add.mock.calls[0]?.[0]).toMatchObject({ title: "How to switch models" });
  expect(toasts.add.mock.calls[1]?.[0]).toMatchObject({ title: "Effort: keep the default" });
});

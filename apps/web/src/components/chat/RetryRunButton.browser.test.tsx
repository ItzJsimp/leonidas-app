import { RunId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { act, render } from "../../../test/render";
import type { TimelineEntry } from "../../session-logic";
import { V2EventTimelineRow } from "./LeoTimelineV2EventRow";
import { TimelineRowCtx, type TimelineRowSharedState } from "./TimelineRowContext";
import { retryPromptForRun } from "./retryPrompt";

it.each([1280, 390])("keeps the error folded and fills the prompt at %i pixels", async (width) => {
  await page.viewport(width, 800);
  const runId = RunId.make("run-1");
  const fill = vi.fn();
  const entries = [
    { kind: "message", message: { role: "user", text: "Try my request", runId } },
  ] as TimelineEntry[];
  const context = {
    providerStatuses: [],
    runs: [],
    markdownCwd: undefined,
    skills: [],
    onRetryRun: (id: typeof runId) => fill(retryPromptForRun(entries, id)),
  } as unknown as TimelineRowSharedState;
  const row = {
    kind: "event",
    id: "error",
    createdAt: "2026-11-11T12:00:00Z",
    projectedItem: {
      visibility: "local",
      item: {
        type: "error",
        runId,
        status: "failed",
        parentItemId: null,
        failure: { class: "provider_error", message: "The connection ended.", code: null },
      },
    },
  } as never;
  await using screen = await render(
    <TimelineRowCtx value={context}>
      <V2EventTimelineRow row={row} />
    </TimelineRowCtx>,
  );
  const details = screen.container.querySelector("details")!;
  expect(details.open).toBe(false);
  expect(fill).not.toHaveBeenCalled();
  const retry = [...screen.container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Retry"),
  )!;
  expect(retry).toBeDefined();
  expect(retry.getBoundingClientRect().width).toBeGreaterThan(0);
  await act(async () => retry.click());
  expect(fill).toHaveBeenCalledExactlyOnceWith("Try my request");
  expect(details.open).toBe(false);
  await page.viewport(1280, 800);
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import type { ContextWindowSnapshot } from "~/lib/contextWindow";
import { ContextWindowMeter } from "./ContextWindowMeter";

function snapshot(usedPercentage: number | null, maxTokens: number | null): ContextWindowSnapshot {
  return {
    usedTokens: 45_000,
    maxTokens,
    usedPercentage,
    remainingTokens: null,
    remainingPercentage: null,
    updatedAt: "2026-11-11T00:00:00.000Z",
  } as unknown as ContextWindowSnapshot;
}

let host: HTMLDivElement;
let root: Root;

async function render(usage: ContextWindowSnapshot | null) {
  await act(async () => root.render(<ContextWindowMeter usage={usage} />));
}
const ringStroke = () => host.querySelectorAll("circle")[1]?.getAttribute("stroke");
const ringText = () => host.querySelector("button span.relative span")?.textContent;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("ContextWindowMeter ring", () => {
  it("shows the percent inside the ring, in blue under 40%", async () => {
    await render(snapshot(25, 200_000));
    expect(ringText()).toBe("25%");
    expect(ringStroke()).toBe("var(--color-info)");
  });

  it("turns yellow from 40% and red from 70%", async () => {
    await render(snapshot(55, 200_000));
    expect(ringStroke()).toBe("var(--color-warning)");
    await render(snapshot(85, 200_000));
    expect(ringText()).toBe("85%");
    expect(ringStroke()).toBe("var(--color-destructive)");
  });

  it("shows dashes before any usage and the token count when the window size is unknown", async () => {
    await render(null);
    expect(ringText()).toBe("--");
    await render(snapshot(null, null));
    expect(ringText()).toBe("45k");
  });
});

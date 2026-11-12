import type { TradingTradeView } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildTagEvent,
  dayRows,
  errorReason,
  isImageType,
  journalErrorText,
  screenshotParts,
  setupChoices,
  tokenEstimate,
} from "./journal.logic";

// Made-up trades. Real trades stay on the trader's PC.
const trade = (id: string, day: string, pnl: number, breaks?: string[]): TradingTradeView => ({
  id: `topstepx:${id}`,
  accountId: "acct-0001",
  day,
  at: `${day}T10:00:00-05:00`,
  pnl,
  ...(breaks ? { ruleBreaks: breaks } : {}),
});
const SHOT_NAME = "0123456789abcdef0123456789abcdef.png";

describe("dayRows", () => {
  it("counts trades, net dollars and rule breaks per day, newest first", () => {
    const rows = dayRows(
      [
        trade("1", "2026-11-03", 10),
        trade("2", "2026-11-04", 3, ["late"]),
        trade("3", "2026-11-04", -1),
      ],
      "2026-11-04",
    );
    expect(rows).toEqual([
      { day: "2026-11-04", count: 2, pnl: 2, breaks: 1 },
      { day: "2026-11-03", count: 1, pnl: 10, breaks: 0 },
    ]);
  });

  it("always includes today, even with no trades", () => {
    expect(dayRows([], "2026-11-11")).toEqual([{ day: "2026-11-11", count: 0, pnl: 0, breaks: 0 }]);
  });
});

describe("setupChoices", () => {
  it("lists the pack setups, and keeps a setup the pack no longer has", () => {
    expect(setupChoices([{ name: "Setup 1" }], undefined)).toEqual([["Setup 1", "Setup 1"]]);
    expect(setupChoices([{ name: "Setup 1" }], "Old setup")).toEqual([
      ["Old setup", "Old setup"],
      ["Setup 1", "Setup 1"],
    ]);
  });
});

describe("buildTagEvent", () => {
  it("builds a trade.tagged event with the setup name and a local stamp", () => {
    const event = buildTagEvent("topstepx:1", "Setup 1", new Date(2026, 10, 4, 9, 30));
    expect(event).toMatchObject({
      kind: "trade.tagged",
      tradeId: "topstepx:1",
      setup: "Setup 1",
      at: expect.stringMatching(/^2026-11-04T09:30:00[+-]\d{2}:\d{2}$/),
    });
    expect(typeof event.id).toBe("string");
  });
});

describe("screenshotParts", () => {
  it("reads the day and name of a path the server wrote", () => {
    expect(screenshotParts(`screenshots/2026-11-04/${SHOT_NAME}`)).toEqual({
      day: "2026-11-04",
      name: SHOT_NAME,
    });
  });

  it("rejects any other path", () => {
    expect(screenshotParts(`screenshots/2026-11-04/../${SHOT_NAME}`)).toBeNull();
    expect(screenshotParts("screenshots/2026-11-04/abc.png")).toBeNull();
    expect(screenshotParts(`../screenshots/2026-11-04/${SHOT_NAME}`)).toBeNull();
  });
});

describe("tokenEstimate, image types and errors", () => {
  it("estimates one token for every four characters, rounded up", () => {
    expect(tokenEstimate(4000)).toBe(1000);
    expect(tokenEstimate(4001)).toBe(1001);
  });

  it("accepts only PNG, JPEG and WebP", () => {
    expect(isImageType("image/png")).toBe(true);
    expect(isImageType("image/jpeg")).toBe(true);
    expect(isImageType("image/webp")).toBe(true);
    expect(isImageType("image/gif")).toBe(false);
  });

  it("reads the reason of a server error and words it plainly", () => {
    expect(errorReason({ _tag: "TradingStateError", reason: "image_too_large" })).toBe(
      "image_too_large",
    );
    expect(errorReason(new Error("boom"))).toBeUndefined();
    expect(journalErrorText("image_too_large")).toContain("5 MB");
    expect(journalErrorText(undefined)).toBe("Could not save. Try again.");
  });
});

import { describe, expect, it } from "vite-plus/test";

import {
  attributeChatQuota,
  fromChatQuotaLine,
  toChatQuotaLine,
  type ChatQuotaReading,
} from "./chatQuota.ts";

const R5 = "2026-11-13T06:00:00.000Z";
const R7 = "2026-11-15T11:00:00.000Z";
const at = (minute: number) => Date.parse("2026-11-13T01:00:00.000Z") + minute * 60_000;
const reading = (
  minute: number,
  threadId: string,
  u5: number,
  u7: number,
  r5 = R5,
): ChatQuotaReading => ({
  at: at(minute),
  threadId,
  fiveHour: { usedPercent: u5, resetsAt: r5 },
  weekly: { usedPercent: u7, resetsAt: R7 },
});

const byThread = (rows: ReturnType<typeof attributeChatQuota>) =>
  Object.fromEntries(rows.map((row) => [row.threadId, row]));

describe("attributeChatQuota", () => {
  it("gives every rise to the only active chat, with no shared part", () => {
    const rows = byThread(
      attributeChatQuota("claudeAgent_justine", [
        reading(0, "a", 0, 64),
        reading(10, "a", 20, 66),
        reading(40, "a", 50, 69),
        reading(160, "a", 100, 73),
      ]),
    );
    expect(rows.a?.fiveHour).toEqual({ points: 100, sharedPoints: 0 });
    expect(rows.a?.weekly).toEqual({ points: 9, sharedPoints: 0 });
    expect(rows.a?.providerInstanceId).toBe("claudeAgent_justine");
  });

  it("marks a rise as shared when another chat made the reading before it", () => {
    const rows = byThread(
      attributeChatQuota("x", [
        reading(0, "a", 10, 1),
        reading(1, "a", 12, 1),
        reading(2, "b", 15, 1),
        reading(3, "b", 16, 1),
      ]),
    );
    expect(rows.a?.fiveHour).toEqual({ points: 2, sharedPoints: 0 });
    expect(rows.b?.fiveHour).toEqual({ points: 4, sharedPoints: 3 });
  });

  it("starts a new window from zero and marks its opening rise as shared", () => {
    const rows = byThread(
      attributeChatQuota("x", [
        reading(0, "a", 90, 5),
        reading(300, "a", 4, 5, "2026-11-13T11:00:00.000Z"),
        reading(301, "a", 6, 5, "2026-11-13T11:00:00.000Z"),
      ]),
    );
    expect(rows.a?.fiveHour).toEqual({ points: 6, sharedPoints: 4 });
  });

  it("ignores drops, readings out of order and reset times a few seconds apart", () => {
    const rows = byThread(
      attributeChatQuota("x", [
        reading(2, "a", 18, 1, "2026-11-13T06:00:02.000Z"),
        reading(0, "a", 10, 1),
        reading(1, "a", 20, 1),
      ]),
    );
    expect(rows.a?.fiveHour).toEqual({ points: 10, sharedPoints: 0 });
    expect(rows.a?.firstAt).toBe(at(0));
    expect(rows.a?.lastAt).toBe(at(2));
  });

  it("round-trips a stored line", () => {
    const value = reading(5, "a", 33, 7);
    expect(fromChatQuotaLine(toChatQuotaLine(value))).toEqual(value);
    const fiveOnly: ChatQuotaReading = { at: 1, threadId: "b", fiveHour: { usedPercent: 2 } };
    expect(fromChatQuotaLine(toChatQuotaLine(fiveOnly))).toEqual({
      at: 1,
      threadId: "b",
      fiveHour: { usedPercent: 2, resetsAt: undefined },
    });
  });
});

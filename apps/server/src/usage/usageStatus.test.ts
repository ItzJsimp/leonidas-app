import type { ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { usageStatus } from "./usageStatus.ts";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const account = (over: {
  id: string;
  usedPercent?: number;
  resetsAt?: string;
  issue?: string;
  label?: string;
}) =>
  ({
    instanceId: over.id,
    driver: "claudeAgent",
    auth: { label: over.label ?? over.id },
    ...(over.issue === undefined ? {} : { connectionIssue: over.issue }),
    ...(over.usedPercent === undefined
      ? {}
      : {
          usageLimits: {
            windows: [
              {
                label: "5 hours",
                usedPercent: over.usedPercent,
                ...(over.resetsAt === undefined ? {} : { resetsAt: over.resetsAt }),
              },
            ],
          },
        }),
  }) as unknown as ServerProvider;

describe("usageStatus", () => {
  it("flags an account at its limit, near its limit, with room, and with no meter", () => {
    const states = usageStatus(
      [
        account({ id: "full", usedPercent: 100 }),
        account({ id: "blocked", issue: "quota_reached" }),
        account({ id: "hot", usedPercent: 92 }),
        account({ id: "calm", usedPercent: 10 }),
        account({ id: "blind" }),
      ],
      NOW,
      90,
    ).map((entry) => [entry.providerInstanceId, entry.state]);
    expect(states).toEqual([
      ["full", "at_limit"],
      ["blocked", "at_limit"],
      ["hot", "near_limit"],
      ["calm", "ok"],
      ["blind", "no_data"],
    ]);
  });

  it("reads a window past its reset time as empty", () => {
    const [entry] = usageStatus(
      [account({ id: "reset", usedPercent: 99, resetsAt: "2026-11-08T11:00:00Z" })],
      NOW,
      90,
    );
    expect(entry?.state).toBe("no_data");
    expect(entry?.windows).toEqual([]);
  });

  it("never returns an email", () => {
    const [entry] = usageStatus([account({ id: "inst-1", label: "me@example.com" })], NOW, 90);
    expect(JSON.stringify(entry)).not.toContain("@");
  });

  it("reports the remaining share of each window", () => {
    const [entry] = usageStatus([account({ id: "a", usedPercent: 30 })], NOW, 90);
    expect(entry?.windows[0]).toMatchObject({ usedPercent: 30, remainingPercent: 70 });
  });
});

import { describe, expect, it } from "vite-plus/test";
import { applyUsageLimitsUpdate } from "@t3tools/provider-core/server/usageLimits";

import {
  claudeRateLimitEventToChatQuota,
  claudeRateLimitEventToUpdate,
  claudeUsageResponseToLimits,
} from "./claudeUsageLimits.ts";

const checkedAt = "2026-07-18T10:00:00.000Z";
const noNames = { overageIncluded: undefined } as const;

describe("claudeUsageResponseToLimits", () => {
  it("maps the session, weekly, and model-scoped weekly windows", () => {
    expect(
      claudeUsageResponseToLimits({
        checkedAt,
        response: {
          rate_limits_available: true,
          rate_limits: {
            five_hour: { utilization: 54, resets_at: "2026-07-18T14:39:00Z" },
            seven_day: { utilization: 18.4, resets_at: "2026-07-24T08:59:00+00:00" },
            seven_day_opus: { utilization: 3, resets_at: null },
            // Newer CLIs add this on top of the typed keys; the pinned SDK
            // typings do not know it yet.
            ...({
              model_scoped: [
                { display_name: "Fable", utilization: 73, resets_at: "2026-07-24T08:59:00Z" },
                { display_name: "Ghost", utilization: null, resets_at: null },
              ],
            } as object),
            extra_usage: {
              is_enabled: false,
              monthly_limit: null,
              used_credits: null,
              utilization: null,
            },
          },
        },
      }),
    ).toEqual({
      names: { overageIncluded: "Fable" },
      limits: {
        checkedAt,
        windows: [
          {
            id: "five_hour",
            kind: "session",
            label: "Session",
            usedPercent: 54,
            windowDurationMins: 300,
            resetsAt: "2026-07-18T14:39:00.000Z",
          },
          {
            id: "seven_day",
            kind: "weekly",
            label: "Weekly",
            usedPercent: 18.4,
            windowDurationMins: 10080,
            resetsAt: "2026-07-24T08:59:00.000Z",
          },
          {
            id: "seven_day_fable",
            kind: "weekly",
            label: "Weekly · Fable",
            usedPercent: 73,
            windowDurationMins: 10080,
            resetsAt: "2026-07-24T08:59:00.000Z",
          },
        ],
      },
    });
  });

  it("names the overage-included bucket only from a scoped entry that drew a row", () => {
    expect(
      claudeUsageResponseToLimits({
        checkedAt,
        response: {
          rate_limits_available: true,
          rate_limits: {
            ...({
              model_scoped: [
                { display_name: "Ghost", utilization: null, resets_at: null },
                { display_name: "Fable", utilization: 5, resets_at: null },
              ],
            } as object),
          },
        },
      }).names,
    ).toEqual({ overageIncluded: "Fable" });
  });

  it.each([
    { rateLimitsAvailable: false, reason: "unsupported" },
    { rateLimitsAvailable: true, reason: "probeFailed" },
  ])(
    "reports null usage as $reason when availability is $rateLimitsAvailable",
    ({ rateLimitsAvailable, reason }) => {
      expect(
        claudeUsageResponseToLimits({
          checkedAt,
          response: { rate_limits_available: rateLimitsAvailable, rate_limits: null },
        }),
      ).toEqual({
        limits: { checkedAt, windows: [], unavailable: expect.objectContaining({ reason }) },
        names: noNames,
      });
    },
  );

  it("keeps a subscription with null rate limits retryable instead of unsupported", () => {
    const { limits } = claudeUsageResponseToLimits({
      checkedAt,
      response: { rate_limits_available: true, rate_limits: null },
    });
    expect(limits.unavailable?.reason).toBe("probeFailed");
    // A streamed event must be able to fill the bars afterwards.
    expect(
      applyUsageLimitsUpdate({
        previous: limits,
        checkedAt,
        update: {
          windows: [{ id: "five_hour", kind: "session", label: "Session", usedPercent: 12 }],
        },
      })?.unavailable,
    ).toBeUndefined();
  });

  it("skips a window the endpoint reports without a utilization", () => {
    expect(
      claudeUsageResponseToLimits({
        checkedAt,
        response: {
          rate_limits_available: true,
          rate_limits: {
            five_hour: { utilization: null, resets_at: null },
            seven_day: { utilization: 250, resets_at: null },
          },
        },
      }).limits.windows,
    ).toEqual([
      {
        id: "seven_day",
        kind: "weekly",
        label: "Weekly",
        usedPercent: 100,
        windowDurationMins: 10080,
      },
    ]);
  });

  const enterpriseResponse = {
    rate_limits_available: true,
    rate_limits: {
      five_hour: null,
      seven_day: null,
      spend: {
        enabled: true,
        used: { amount_minor: 4_631, currency: "USD", exponent: 2 },
        limit: { amount_minor: 50_000, currency: "USD", exponent: 2 },
        percent: 9,
      },
      extra_usage: {
        is_enabled: true,
        used_credits: 4_631,
        monthly_limit: 50_000,
        utilization: 9.261999999999999,
        currency: "USD",
        decimal_places: 2,
      },
    },
  };
  const monthlyWindow = {
    id: "monthly_spend",
    kind: "monthly",
    label: "Monthly spend",
    usedPercent: expect.closeTo(9.262, 10),
  };

  it("maps the captured Enterprise budget precisely, preferring spend beside rolling windows", () => {
    expect(claudeUsageResponseToLimits({ checkedAt, response: enterpriseResponse }).limits).toEqual(
      {
        checkedAt,
        windows: [monthlyWindow],
      },
    );
    const response = {
      ...enterpriseResponse,
      rate_limits: {
        ...enterpriseResponse.rate_limits,
        five_hour: { utilization: 12, resets_at: null },
        extra_usage: {
          ...enterpriseResponse.rate_limits.extra_usage,
          used_credits: 30_000,
          utilization: 60,
        },
      },
    };
    expect(claudeUsageResponseToLimits({ checkedAt, response }).limits.windows).toEqual([
      {
        id: "five_hour",
        kind: "session",
        label: "Session",
        usedPercent: 12,
        windowDurationMins: 300,
      },
      monthlyWindow,
    ]);
  });

  it("falls back to enabled extra usage amounts or utilization when spend is unusable", () => {
    const response = {
      ...enterpriseResponse,
      rate_limits: {
        ...enterpriseResponse.rate_limits,
        spend: {
          ...enterpriseResponse.rate_limits.spend,
          enabled: false,
          used: { amount_minor: 30_000, currency: "USD", exponent: 2 },
        },
        extra_usage: { ...enterpriseResponse.rate_limits.extra_usage, utilization: 9 },
      },
    };
    expect(claudeUsageResponseToLimits({ checkedAt, response }).limits.windows).toEqual([
      monthlyWindow,
    ]);
    const utilizationOnly = {
      ...response,
      rate_limits: {
        ...response.rate_limits,
        spend: { enabled: true, used: null, limit: null, percent: 9 },
        extra_usage: {
          ...enterpriseResponse.rate_limits.extra_usage,
          used_credits: null,
          monthly_limit: null,
        },
      },
    };
    expect(
      claudeUsageResponseToLimits({ checkedAt, response: utilizationOnly }).limits.windows,
    ).toEqual([monthlyWindow]);
  });

  it("omits disabled budgets and refuses invalid money without an enabled fallback", () => {
    const rateLimits = enterpriseResponse.rate_limits;
    const response = {
      ...enterpriseResponse,
      rate_limits: {
        ...rateLimits,
        spend: { ...rateLimits.spend, enabled: false },
        extra_usage: { ...rateLimits.extra_usage, is_enabled: false },
      },
    };
    expect(claudeUsageResponseToLimits({ checkedAt, response }).limits.windows).toEqual([]);
    response.rate_limits.spend = {
      ...rateLimits.spend,
      limit: { ...rateLimits.spend.limit, currency: "EUR" },
    };
    expect(claudeUsageResponseToLimits({ checkedAt, response }).limits.windows).toEqual([]);
    response.rate_limits.spend = {
      ...rateLimits.spend,
      limit: { ...rateLimits.spend.limit, amount_minor: 0 },
    };
    expect(claudeUsageResponseToLimits({ checkedAt, response }).limits.windows).toEqual([]);
  });
});

describe("claudeRateLimitEventToUpdate", () => {
  it.each(["constructor", "toString", "__proto__"])(
    "ignores unknown prototype window %s",
    (type) => {
      expect(
        claudeRateLimitEventToUpdate(
          { status: "allowed", rateLimitType: type as never, utilization: 0.5 },
          noNames,
        ),
      ).toBeUndefined();
    },
  );
  it("scales the 0–1 utilization and epoch-second reset onto the probe's window id", () => {
    expect(
      claudeRateLimitEventToUpdate(
        {
          status: "allowed_warning",
          rateLimitType: "seven_day",
          utilization: 0.85,
          resetsAt: 1_784_000_000,
        },
        noNames,
      ),
    ).toEqual({
      windows: [
        {
          id: "seven_day",
          kind: "weekly",
          label: "Weekly",
          usedPercent: 85,
          windowDurationMins: 10080,
          resetsAt: "2026-07-14T03:33:20.000Z",
        },
      ],
    });
  });

  it("lands the streamed overage-included bucket on the row the probe named", () => {
    const event = {
      status: "allowed",
      rateLimitType: "seven_day_overage_included" as never,
      utilization: 0.4,
    } as const;
    expect(claudeRateLimitEventToUpdate(event, noNames)).toBeUndefined();
    expect(claudeRateLimitEventToUpdate(event, { overageIncluded: "Fable" })).toEqual({
      windows: [
        {
          id: "seven_day_fable",
          kind: "weekly",
          label: "Weekly · Fable",
          usedPercent: 40,
          windowDurationMins: 10080,
        },
      ],
    });
  });

  it("ignores windows the page does not render and allowed events without a utilization", () => {
    expect(
      claudeRateLimitEventToUpdate(
        { status: "allowed", rateLimitType: "seven_day_opus", utilization: 0.1 },
        noNames,
      ),
    ).toBeUndefined();
    expect(
      claudeRateLimitEventToUpdate({ status: "allowed", rateLimitType: "five_hour" }, noNames),
    ).toBeUndefined();
  });

  it("treats rejected events without utilization as 100% used", () => {
    expect(
      claudeRateLimitEventToUpdate({ status: "rejected", rateLimitType: "five_hour" }, noNames),
    ).toEqual({
      windows: [
        {
          id: "five_hour",
          kind: "session",
          label: "Session",
          usedPercent: 100,
          windowDurationMins: 300,
        },
      ],
    });
  });
});

describe("claudeRateLimitEventToChatQuota", () => {
  it("reads both windows from unifiedWindows", () => {
    const info = {
      status: "allowed",
      rateLimitType: "five_hour",
      unifiedWindows: {
        five_hour: { utilization: 0.09, resetsAt: 1794123000, status: "allowed" },
        seven_day: { utilization: 0.27, resetsAt: 1794481200, status: "allowed" },
      },
    } as Parameters<typeof claudeRateLimitEventToChatQuota>[0];
    expect(claudeRateLimitEventToChatQuota(info, "thread-1", 5)).toEqual({
      at: 5,
      threadId: "thread-1",
      fiveHour: { usedPercent: 9, resetsAt: "2026-11-08T07:30:00.000Z" },
      weekly: { usedPercent: 27, resetsAt: "2026-11-12T11:00:00.000Z" },
    });
  });

  it("falls back to the event's own window, and skips events with no percent", () => {
    expect(
      claudeRateLimitEventToChatQuota(
        { status: "allowed", rateLimitType: "seven_day", utilization: 0.5 },
        "t",
        1,
      ),
    ).toEqual({ at: 1, threadId: "t", weekly: { usedPercent: 50, resetsAt: undefined } });
    expect(
      claudeRateLimitEventToChatQuota({ status: "rejected", rateLimitType: "five_hour" }, "t", 1),
    ).toBeUndefined();
  });
});

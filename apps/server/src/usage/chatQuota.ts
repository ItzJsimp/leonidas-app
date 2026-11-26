/**
 * Per-chat plan quota. Claude reports the account's five-hour and weekly used percent on almost
 * every request. Each reading is tagged with the thread that made the request, so the rise between
 * two readings belongs to that thread. A rise is "shared" when another thread made the reading
 * before it, or when it opens a new window: other chats, other devices or claude.ai may have used
 * part of it. No provider reports quota per request, so these are estimates in percentage points.
 */
export interface ChatQuotaWindowReading {
  readonly usedPercent: number;
  readonly resetsAt?: string | undefined;
}

export interface ChatQuotaReading {
  /** Epoch milliseconds. */
  readonly at: number;
  readonly threadId: string;
  readonly fiveHour?: ChatQuotaWindowReading | undefined;
  readonly weekly?: ChatQuotaWindowReading | undefined;
}

export interface ChatQuotaUse {
  /** All points attributed to the chat, shared ones included. */
  readonly points: number;
  /** The part of `points` that other activity may have caused. */
  readonly sharedPoints: number;
}

export interface ChatQuotaTotals {
  readonly threadId: string;
  readonly providerInstanceId: string;
  readonly fiveHour: ChatQuotaUse;
  readonly weekly: ChatQuotaUse;
  readonly firstAt: number;
  readonly lastAt: number;
}

const WINDOWS = ["fiveHour", "weekly"] as const;
/** Reset times from the stream and from the usage probe can differ by a few seconds. */
const SAME_RESET_TOLERANCE_MS = 5 * 60_000;

const sameReset = (a: string | undefined, b: string | undefined): boolean => {
  if (a === undefined || b === undefined) return a === b;
  const diff = Math.abs(Date.parse(a) - Date.parse(b));
  return Number.isFinite(diff) && diff <= SAME_RESET_TOLERANCE_MS;
};

const sameWindow = (a: ChatQuotaWindowReading, b: ChatQuotaWindowReading): boolean =>
  sameReset(a.resetsAt, b.resetsAt);

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Readings of one account, in any order. The first reading of each window is only a baseline.
 * With `currentWindowAt`, only rises in the window still open at that time count: the chat's
 * share of the limit now, not its total across every window it spanned.
 */
export function attributeChatQuota(
  providerInstanceId: string,
  readings: ReadonlyArray<ChatQuotaReading>,
  currentWindowAt?: number,
): ChatQuotaTotals[] {
  const sorted = [...readings].sort((a, b) => a.at - b.at);
  // The reset time of the newest reading for each plan window: the window open now.
  const openReset: Partial<Record<(typeof WINDOWS)[number], string>> = {};
  for (const reading of sorted) {
    for (const id of WINDOWS) {
      const resetsAt = reading[id]?.resetsAt;
      if (resetsAt !== undefined) openReset[id] = resetsAt;
    }
  }
  const totals = new Map<
    string,
    { five: [number, number]; week: [number, number]; firstAt: number; lastAt: number }
  >();
  const previous: Partial<
    Record<(typeof WINDOWS)[number], { reading: ChatQuotaWindowReading; threadId: string }>
  > = {};
  for (const reading of sorted) {
    let entry = totals.get(reading.threadId);
    if (!entry) {
      entry = { five: [0, 0], week: [0, 0], firstAt: reading.at, lastAt: reading.at };
      totals.set(reading.threadId, entry);
    }
    entry.lastAt = reading.at;
    for (const id of WINDOWS) {
      const reported = reading[id];
      if (!reported) continue;
      const prior = previous[id];
      // A reading without a reset time stays in the window the previous reading named.
      const current: ChatQuotaWindowReading =
        reported.resetsAt === undefined && prior
          ? { ...reported, resetsAt: prior.reading.resetsAt }
          : reported;
      previous[id] = { reading: current, threadId: reading.threadId };
      if (!prior) continue;
      const open = openReset[id];
      const outsideOpenWindow =
        open === undefined ||
        !sameReset(current.resetsAt, open) ||
        Date.parse(open) <= (currentWindowAt ?? Number.NEGATIVE_INFINITY);
      if (currentWindowAt !== undefined && outsideOpenWindow) continue;
      const inWindow = sameWindow(prior.reading, current);
      const delta = inWindow
        ? current.usedPercent - prior.reading.usedPercent
        : current.usedPercent;
      if (delta <= 0) continue;
      const bucket = id === "fiveHour" ? entry.five : entry.week;
      bucket[0] += delta;
      if (!inWindow || prior.threadId !== reading.threadId) bucket[1] += delta;
    }
  }
  return [...totals].map(([threadId, entry]) => ({
    threadId,
    providerInstanceId,
    fiveHour: { points: round1(entry.five[0]), sharedPoints: round1(entry.five[1]) },
    weekly: { points: round1(entry.week[0]), sharedPoints: round1(entry.week[1]) },
    firstAt: entry.firstAt,
    lastAt: entry.lastAt,
  }));
}

/** One stored line: short keys keep a month of readings near 1 MB per account. */
export interface ChatQuotaLine {
  readonly t: number;
  readonly th: string;
  readonly u5?: number | undefined;
  readonly r5?: string | undefined;
  readonly u7?: number | undefined;
  readonly r7?: string | undefined;
}

export const toChatQuotaLine = (reading: ChatQuotaReading): ChatQuotaLine => ({
  t: reading.at,
  th: reading.threadId,
  ...(reading.fiveHour ? { u5: reading.fiveHour.usedPercent } : {}),
  ...(reading.fiveHour?.resetsAt ? { r5: reading.fiveHour.resetsAt } : {}),
  ...(reading.weekly ? { u7: reading.weekly.usedPercent } : {}),
  ...(reading.weekly?.resetsAt ? { r7: reading.weekly.resetsAt } : {}),
});

export const fromChatQuotaLine = (line: ChatQuotaLine): ChatQuotaReading => ({
  at: line.t,
  threadId: line.th,
  ...(line.u5 === undefined ? {} : { fiveHour: { usedPercent: line.u5, resetsAt: line.r5 } }),
  ...(line.u7 === undefined ? {} : { weekly: { usedPercent: line.u7, resetsAt: line.r7 } }),
});

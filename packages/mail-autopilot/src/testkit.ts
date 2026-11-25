import type { MailMessage, Pack } from "./types.ts";

export const msg = (over: Partial<MailMessage> = {}): MailMessage => ({
  id: "m1",
  threadId: "t1",
  fromName: "Sam Example",
  fromAddress: "sam@example.test",
  subject: "",
  snippet: "",
  attachmentNames: [],
  listUnsubscribe: false,
  labels: [],
  isOwn: false,
  ownRepliedInThread: false,
  ...over,
});

/** Small made-up pack for engine tests. Not a real pack. */
export const testPack: Pack = {
  id: "test",
  name: "Test pack",
  rules: [
    {
      id: "contract",
      bucket: "contract",
      match: {
        keywords: ["contract*", "statement of work", "sow"],
        attachmentKeywords: ["agreement"],
      },
    },
    { id: "existing", bucket: "existing", match: { ownRepliedInThread: true } },
    { id: "paid", bucket: "paid", match: { keywords: ["rates", "budget"] } },
    { id: "gift", bucket: "gift", match: { keywords: ["gift", "commission*"] } },
    {
      id: "noise",
      bucket: "noise",
      match: { fromKeywords: ["no-reply", "noreply"], listUnsubscribe: true },
    },
  ],
  labels: {
    contract: ["T/Contract"],
    existing: ["T/Existing", "T/Needs-Reply"],
    paid: ["T/Paid", "T/Needs-Reply"],
    gift: ["T/Gift", "T/Needs-Reply"],
    noise: ["T/Noise"],
    review: ["T/Needs-Review"],
  },
  drafts: {
    paid: { body: "Hi {{firstName}},\n\nThanks. Our rates are on the card.\n" },
    gift: { body: "Hi {{firstName}},\n\nWe do paid work only.\n" },
  },
  neverDraft: ["contract"],
  alwaysSurface: ["contract"],
  archive: ["noise"],
};

/** The reference workload below takes about 19 ms on the dev PC (median of 9 runs, 2026-11-24). */
const REFERENCE_MS = 19;
const referenceWorkload = () => {
  let n = 0;
  for (let i = 0; i < 300_000; i++) n += `k${i}`.length + (/7/.test(String(i)) ? 1 : 0);
  return n;
};

/**
 * How many times slower this machine runs the reference workload than the dev PC, never below 1.
 * A timing limit is multiplied by it, so a shared CI runner keeps the same headroom the dev PC
 * has, and a fast machine keeps the limit as written.
 */
export function machineSlowdown(): number {
  const samples: number[] = [];
  for (let run = 0; run < 5; run++) {
    const start = performance.now();
    referenceWorkload();
    samples.push(performance.now() - start);
  }
  return Math.max(1, samples.toSorted((a, b) => a - b)[2]! / REFERENCE_MS);
}

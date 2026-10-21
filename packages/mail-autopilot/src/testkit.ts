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

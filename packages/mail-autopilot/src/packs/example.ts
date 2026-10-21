import { parsePack } from "../pack.ts";

/**
 * A made-up creator inbox pack. Real packs hold business data (prices, names, reply text), so they live in the
 * user's AIOS and load through `parsePackJson`. This one ships with the app as a starting point and as a test pack.
 */
export const examplePack = parsePack({
  id: "example-creator",
  name: "Example creator inbox",
  rules: [
    {
      id: "contract",
      bucket: "contract",
      match: {
        keywords: [
          "docusign",
          "pandadoc",
          "hellosign",
          "contract*",
          "agreement*",
          "sow",
          "statement of work",
          "terms of service agreement",
        ],
        attachmentKeywords: ["contract*", "agreement*", "sow", "terms"],
      },
    },
    {
      id: "invoice",
      bucket: "invoice",
      match: {
        keywords: [
          "invoice*",
          "remittance",
          "payment received",
          "payment confirmation",
          "payment sent",
          "ach",
          "overdue",
          "receipt for",
          "paid you",
          "payout*",
        ],
      },
    },
    { id: "existing", bucket: "existing", match: { ownRepliedInThread: true } },
    {
      id: "barter",
      bucket: "barter",
      match: {
        keywords: [
          "gift",
          "gifted",
          "gifting",
          "free product",
          "in exchange for",
          "commission*",
          "affiliate*",
          "barter",
          "product seeding",
          "no budget",
        ],
      },
    },
    {
      id: "paid",
      bucket: "paid",
      match: {
        keywords: [
          "budget",
          "rate",
          "rates",
          "rate card",
          "pricing*",
          "paid campaign",
          "paid partnership",
          "paid collab",
          "sponsor*",
          "ugc",
          "collab*",
          "campaign brief",
          "rfp",
          "whitelist*",
        ],
      },
    },
    {
      id: "noise",
      bucket: "noise",
      match: {
        keywords: [
          "newsletter*",
          "unsubscribe*",
          "no-reply",
          "noreply",
          "notification*",
          "tiktok shop",
          "google cloud",
          "verify your",
          "security alert",
          "digest*",
        ],
        fromKeywords: [
          "no-reply",
          "noreply",
          "notification",
          "notifications",
          "mailer-daemon",
          "newsletter",
          "news",
        ],
      },
    },
  ],
  labels: {
    contract: ["Ex/Contract"],
    invoice: ["Ex/Invoice"],
    existing: ["Ex/Existing-Client", "Ex/Needs-Reply"],
    barter: ["Ex/Barter", "Ex/Needs-Reply"],
    paid: ["Ex/Paid-Deal", "Ex/Needs-Reply"],
    noise: ["Ex/Noise"],
    review: ["Ex/Needs-Review"],
  },
  drafts: {
    barter: {
      body: "Hi {{firstName}},\n\nThanks for thinking of us. We only take on paid work.\n\nCould you share your timeline and the budget you have in mind for this campaign?\n\nBest,\n[Your name]\n",
    },
    paid: {
      body: "Hi {{firstName}},\n\nThanks for reaching out, this sounds like a good fit.\n\nCould you share your timeline and the budget you have in mind?\n\nBest,\n[Your name]\n",
    },
  },
  neverDraft: ["contract", "invoice", "existing"],
  alwaysSurface: ["contract", "invoice"],
  archive: ["noise"],
});

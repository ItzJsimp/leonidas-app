import type {
  ContentListResult,
  ContentProposal,
  ContentStage,
  ContentVideo,
} from "@t3tools/contracts";

/** Made-up deals for tests and screenshots. No real brand or deal data. */
const video = (
  deal: string,
  n: number,
  title: string,
  stage: ContentStage,
  extra: Partial<ContentVideo> = {},
): ContentVideo => ({
  deal,
  file: `${String(n).padStart(2, "0")}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  id: `video-${deal}-${n}`,
  title,
  stage,
  approval: stage === "ready_to_film" ? "approved" : "none",
  revision: 0,
  footage: [],
  idea: "Show the product doing its one job.",
  script:
    stage === "idea"
      ? ""
      : 'VISUAL: Phone falls down the stairs.\nSPOKEN: "Three floors. Not one crack."\nSFX: Thud.',
  shotList: "- Wide shot of the stairs",
  notes: "",
  scorecard: {
    spokenSeconds: 2,
    bannedWords: [],
    doNotHits: [],
    blocks: [],
    warnings: [],
  },
  ...extra,
});

export const fixtureList = (): ContentListResult => ({
  deals: [
    {
      slug: "acme-cases",
      brand: "Acme Cases",
      doNot: ["cheap"],
      videos: [
        video("acme-cases", 1, "Drop test on the stairs", "ready_to_film", {
          due: "2026-11-05",
          approvedBy: "Sam",
          lengthS: 30,
        }),
        video("acme-cases", 2, "Pocket check with keys", "script_review", {
          due: "2026-11-07",
          pen: "agent",
          scorecard: {
            hookScore: 8,
            spokenSeconds: 28,
            targetSeconds: 30,
            bannedWords: [],
            doNotHits: [],
            writerModel: "model-a",
            criticModel: "model-b",
            blocks: [],
            warnings: [],
          },
        }),
        video("acme-cases", 3, "Unboxing in 15 seconds", "idea"),
      ],
    },
    {
      slug: "lumen-lamp",
      brand: "Lumen Lamp",
      doNot: [],
      videos: [
        video("lumen-lamp", 1, "Desk at 2 AM, before and after", "ready_to_film", {
          due: "2026-11-02",
          approvedBy: "Alex",
        }),
        video("lumen-lamp", 2, "Three brightness levels", "cut_review"),
        video("lumen-lamp", 3, "Hype reel", "scripting", {
          scorecard: {
            spokenSeconds: 9,
            bannedWords: ["game changer"],
            doNotHits: [],
            blocks: ['Banned word: "game changer"'],
            warnings: [],
          },
        }),
        video("lumen-lamp", 4, "Charging base test", "paid"),
      ],
    },
  ],
  bad: [],
  proposals: [],
});

export const PROPOSAL: ContentProposal = {
  slug: "lumen-lamp-2",
  brand: "Lumen Lamp Two",
  contact: "Alex <alex@example.invalid>",
  terms: "Two videos.",
  deadline: "2026-12-01",
  source: "Email from Alex, Oct 28",
  proposedBy: "thread t1",
  created: "2026-10-30",
};

export const EMPTY_LIST: ContentListResult = { deals: [], bad: [], proposals: [] };

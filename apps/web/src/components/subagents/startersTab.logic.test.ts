import { describe, expect, it } from "vite-plus/test";

import { SUBAGENT_STARTERS } from "~/onboarding/subagentStarters";

import {
  importedMessage,
  importLabel,
  starterCards,
  starterDescription,
} from "./startersTab.logic";

describe("starters tab logic", () => {
  it("makes one card per starter file, with its job and model", () => {
    const cards = starterCards(SUBAGENT_STARTERS, new Set());
    expect(cards).toHaveLength(SUBAGENT_STARTERS.length);
    const researcher = cards.find((card) => card.name === "researcher");
    expect(researcher?.description).toBe(
      "Searches the web and documentation and returns a short, cited answer.",
    );
    expect(researcher?.model).toBe("claude-haiku-5-5");
    expect(cards.every((card) => card.description.length > 0 && !card.inTeam)).toBe(true);
  });

  it("flags a starter the team holds, and offers another copy instead of Import", () => {
    const cards = starterCards(SUBAGENT_STARTERS, new Set(["summarizer"]));
    const summarizer = cards.find((card) => card.name === "summarizer");
    expect(summarizer?.inTeam).toBe(true);
    expect(importLabel(summarizer!)).toBe("Add another copy");
    expect(importLabel({ inTeam: false })).toBe("Import");
  });

  it("reads a quoted or plain description, and an empty one when missing", () => {
    expect(starterDescription('---\nname: a\ndescription: "Does a job."\n---\n')).toBe(
      "Does a job.",
    );
    expect(starterDescription("---\nname: a\ndescription: Plain job\n---\n")).toBe("Plain job");
    expect(starterDescription("---\nname: a\n---\n")).toBe("");
  });

  it("says when an import was renamed so it never overwrote the agent", () => {
    expect(importedMessage("summarizer", "summarizer")).toBe("summarizer is on your team.");
    expect(importedMessage("summarizer", "summarizer-2")).toBe(
      "summarizer was already on your team, so it was added as summarizer-2.",
    );
  });
});

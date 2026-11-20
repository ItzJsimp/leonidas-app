import type { SavedItem } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  filterPrompts,
  insertPromptText,
  promptGroup,
  promptGroups,
  savedPromptTitle,
} from "./promptLibrary";

const item = (id: string, title: string, body: string, tags: string[] = []) =>
  ({ id, title, body, tags, kind: "prompt", status: "queued" }) as unknown as SavedItem;

const next = item("folder:saved-prompt-next.md", "Next", "Rank my open tasks.");
const scoped = item("folder:ws%201:saved-prompt-ship-it.md", "Ship it", "Run the final checks.");
const digest = item("folder:health-00.md", "Weekly digest", "One page of health.", ["health"]);
const loose = item("folder:promote.md", "Promote", "Promote the draft.");
const all = [loose, digest, scoped, next];

describe("promptGroup", () => {
  it("puts saved-prompt files in Saved, even in a named workspace", () => {
    expect(promptGroup(next)).toBe("Saved");
    expect(promptGroup(scoped)).toBe("Saved");
  });
  it("uses the category, capitalized, and falls back to Other", () => {
    expect(promptGroup(digest)).toBe("Health");
    expect(promptGroup(loose)).toBe("Other");
  });
});

describe("promptGroups", () => {
  it("lists Saved first, Other last, and counts each group", () => {
    expect(promptGroups(all)).toEqual([
      { name: "Saved", count: 2 },
      { name: "Health", count: 1 },
      { name: "Other", count: 1 },
    ]);
  });
});

describe("filterPrompts", () => {
  it("keeps every prompt for All and one group otherwise", () => {
    expect(filterPrompts(all, null, "")).toHaveLength(4);
    expect(filterPrompts(all, "Health", "")).toEqual([digest]);
  });
  it("matches the title or body, ignoring case", () => {
    expect(filterPrompts(all, null, "FINAL")).toEqual([scoped]);
    expect(filterPrompts(all, null, "weekly")).toEqual([digest]);
    expect(filterPrompts(all, null, "nothing like this")).toEqual([]);
  });
  it("lists Saved prompts first", () => {
    expect(filterPrompts(all, null, "").map((row) => row.title)).toEqual([
      "Ship it",
      "Next",
      "Promote",
      "Weekly digest",
    ]);
  });
});

describe("savedPromptTitle", () => {
  it("takes the first four words of the first line", () => {
    expect(savedPromptTitle("Rank my open tasks by impact.\nSecond line")).toBe(
      "Rank my open tasks",
    );
  });
  it("keeps a short message whole", () => {
    expect(savedPromptTitle("  Ship it  ")).toBe("Ship it");
  });
});

describe("insertPromptText", () => {
  it("replaces an empty draft", () => {
    expect(insertPromptText("  ", "Rank my tasks")).toBe("Rank my tasks");
  });
  it("adds after a blank line when the draft has text", () => {
    expect(insertPromptText("Fix the bug", "Rank my tasks")).toBe("Fix the bug\n\nRank my tasks");
  });
});

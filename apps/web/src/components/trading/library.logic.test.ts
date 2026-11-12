import type { TradingLibraryIndexResult, TradingLibrarySearchResult } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  coachLink,
  coachPrompt,
  firmNotice,
  groupHits,
  nextIndex,
  quizScore,
  resourceInput,
  type ResourceDraft,
} from "./library.logic";

// Made-up firm and lesson names. The real course and firm rules stay in the private pack.
type Hit = TradingLibrarySearchResult["hits"][number];
const hit = (kind: Hit["kind"], title: string): Hit => ({ kind, id: title, title, snippet: "" });
const firm = (
  fetchDate: string | null,
  stale: boolean,
): TradingLibraryIndexResult["firms"][number] => ({
  id: "firm-a",
  name: "Firm A",
  fetchDate,
  stale,
});
const DRAFT: ResourceDraft = {
  kind: "link",
  title: "Good read",
  url: "https://example.com/read",
  text: "",
  shareWithCrew: true,
};

describe("groupHits", () => {
  it("groups hits in lesson, knowledge, card, community order and drops empty groups", () => {
    const groups = groupHits([hit("card", "c"), hit("lesson", "l"), hit("card", "c2")]);
    expect(groups.map((group) => [group.label, group.hits.length])).toEqual([
      ["Lessons", 1],
      ["Cards", 2],
    ]);
  });
});

describe("firmNotice", () => {
  it("warns with the fetch date when the page is older than 30 days", () => {
    const notice = firmNotice(firm("2026-01-01", true));
    expect(notice.tone).toBe("stale");
    expect(notice.text).toContain("2026-01-01");
    expect(notice.text).toContain("older than 30 days");
  });

  it("says the date is unknown when the page has none", () => {
    expect(firmNotice(firm(null, true))).toEqual({
      tone: "unknown",
      text: "Fetch date unknown. Check the rules before you trade.",
    });
  });

  it("shows the date and no warning for a fresh page", () => {
    expect(firmNotice(firm("2026-11-01", false))).toEqual({
      tone: "fresh",
      text: "Fetched 2026-11-01.",
    });
  });
});

describe("quiz and flashcards", () => {
  it("scores the answers given so far", () => {
    const questions = [{ correct: 0 }, { correct: 2 }, { correct: 1 }] as const;
    expect(quizScore(questions, { 0: 0, 1: 0 })).toEqual({ answered: 2, correct: 1, total: 3 });
  });

  it("moves to the next card and wraps at the end", () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
    expect(nextIndex(0, 0)).toBe(0);
  });
});

describe("coach link", () => {
  it("names the lesson in the prompt and encodes it for a new thread", () => {
    const prompt = coachPrompt('Opening "range"');
    expect(prompt).toContain('"Opening "range""');
    expect(prompt).not.toContain("—");
    const link = coachLink(prompt);
    expect(link.startsWith("/new?prompt=")).toBe(true);
    expect(new URLSearchParams(link.slice("/new?".length)).get("prompt")).toBe(prompt);
  });
});

describe("resourceInput", () => {
  it("maps Share with the Crew on to a Crew save, and off to a private one", () => {
    const shared = resourceInput(DRAFT);
    expect(shared).toEqual({
      ok: true,
      value: {
        kind: "link",
        title: "Good read",
        url: "https://example.com/read",
        text: undefined,
        private: false,
      },
    });
    const privateOne = resourceInput({ ...DRAFT, shareWithCrew: false });
    expect(privateOne.ok && privateOne.value.private).toBe(true);
  });

  it("asks for a link on a link resource and only accepts http or https", () => {
    expect(resourceInput({ ...DRAFT, url: "" })).toEqual({
      ok: false,
      error: "Add the link.",
    });
    expect(resourceInput({ ...DRAFT, url: "javascript:alert(1)" }).ok).toBe(false);
  });

  it("needs a title, and a link or text", () => {
    expect(resourceInput({ ...DRAFT, title: "   " }).ok).toBe(false);
    expect(resourceInput({ ...DRAFT, kind: "note", url: "", text: "" }).ok).toBe(false);
    expect(resourceInput({ ...DRAFT, kind: "note", url: "", text: "A note." }).ok).toBe(true);
  });
});

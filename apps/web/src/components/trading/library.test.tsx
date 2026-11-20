// @vitest-environment jsdom
import type { TradingLibraryIndexResult } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { CourseSection, FirmsSection, PageReader } from "./LibrarySections";
import { FlashcardDeck, QuizSection } from "./LibraryStudy";
import { SavedView } from "./LibrarySaved";

// Made-up course, firm and quiz text. Real lessons and firm rules stay in the private pack.
type Index = TradingLibraryIndexResult;
const lesson = (overrides: Partial<Index["chapters"][number]["lessons"][number]> = {}) => ({
  id: "lesson-1",
  title: "Opening range",
  duration: "01:00",
  keywords: ["vwap", "gap"],
  hasTranscript: true,
  url: null,
  ...overrides,
});
const CHAPTERS: Index["chapters"] = [
  {
    number: "1",
    title: "Chapter A",
    lessons: [
      lesson({ url: "https://example.com/one" }),
      lesson({ id: "lesson-2", title: "Second lesson", keywords: [], hasTranscript: false }),
    ],
  },
];
const NOOP = () => undefined;

describe("CourseSection", () => {
  it("lists lessons with key words, and Watch on Whop only where a url exists", () => {
    const html = renderToStaticMarkup(<CourseSection chapters={CHAPTERS} onOpen={NOOP} />);
    expect(html).toContain("Opening range");
    expect(html).toContain("Key words: vwap, gap");
    expect(html).toContain("No transcript");
    expect(html.match(/Watch on Whop/g)?.length).toBe(1);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });

  it("teaches what the course is when no pack is linked", () => {
    const html = renderToStaticMarkup(<CourseSection chapters={[]} onOpen={NOOP} />);
    expect(html).toContain("Link your course pack");
  });
});

describe("FirmsSection", () => {
  it("shows a stale warning with the fetch date for a page older than 30 days", () => {
    const html = renderToStaticMarkup(
      <FirmsSection
        firms={[{ id: "firm-a", name: "Firm A", fetchDate: "2026-01-01", stale: true }]}
      />,
    );
    expect(html).toContain("Firm A");
    expect(html).toContain("Fetched 2026-01-01.");
    expect(html).toContain("older than 30 days");
    expect(html).toContain("font-medium text-destructive-foreground");
  });

  it("shows a fresh page without the warning", () => {
    const html = renderToStaticMarkup(
      <FirmsSection
        firms={[{ id: "firm-b", name: "Firm B", fetchDate: "2026-11-01", stale: false }]}
      />,
    );
    expect(html).toContain("Fetched 2026-11-01.");
    expect(html).not.toContain("older than 30 days");
  });
});

describe("PageReader", () => {
  it("offers the coach for a lesson only", () => {
    const page = { id: "lesson-1", title: "Opening range", text: "The open.", truncated: false };
    const lessonHtml = renderToStaticMarkup(
      <PageReader
        kind="lesson"
        page={page}
        error={null}
        loading={false}
        onBack={NOOP}
        onAsk={NOOP}
      />,
    );
    expect(lessonHtml).toContain("Ask the coach about this lesson");
    const knowledgeHtml = renderToStaticMarkup(
      <PageReader
        kind="knowledge"
        page={page}
        error={null}
        loading={false}
        onBack={NOOP}
        onAsk={NOOP}
      />,
    );
    expect(knowledgeHtml).not.toContain("Ask the coach");
  });
});

describe("FlashcardDeck", () => {
  it("shows the front of the first card with a Flip control", () => {
    const html = renderToStaticMarkup(
      <FlashcardDeck
        cards={[
          { front: "What is VWAP?", back: "Volume weighted average price.", citation: "[JJ]" },
        ]}
      />,
    );
    expect(html).toContain("What is VWAP?");
    expect(html).not.toContain("Volume weighted average price.");
    expect(html).toContain("Flip");
    expect(html).toContain("Card 1 of 1");
  });
});

describe("QuizSection", () => {
  it("shows each question with its options and a zero score before any answer", () => {
    const html = renderToStaticMarkup(
      <QuizSection
        questions={[
          {
            id: "Q-01",
            topic: "Foundations",
            level: "Apply",
            source: "Foundations: a check?",
            prompt: "Which check first?",
            correct: 0,
            options: [
              { text: "Read the sample.", why: "" },
              { text: "Count trades.", why: "Too early." },
            ],
          },
        ]}
      />,
    );
    expect(html).toContain("1. Which check first?");
    expect(html).toContain("Read the sample.");
    expect(html).toContain("Answered 0 of 1. Correct 0.");
  });
});

describe("SavedView", () => {
  it("opens with Share with the Crew on and names the link and the text fields", () => {
    const html = renderToStaticMarkup(<SavedView resources={[]} onSave={async () => null} />);
    expect(html).toContain("Share with the Crew");
    expect(html).toContain("Save resource");
    expect(html).toContain("Nothing saved yet");
    expect(html).toMatch(
      /role="switch"[^>]*aria-checked="true"|aria-checked="true"[^>]*role="switch"/,
    );
  });

  it("lists a saved resource with its Private or Crew state", () => {
    const html = renderToStaticMarkup(
      <SavedView
        resources={[
          {
            id: "a1",
            kind: "link",
            title: "Good read",
            url: "https://example.com/read",
            private: false,
            savedAt: "2026-11-12T00:00:00.000Z",
          },
        ]}
        onSave={async () => null}
      />,
    );
    expect(html).toContain("Good read");
    expect(html).toContain("Shared with the Crew");
  });
});

import { RuntimeRequestId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";
import type { PendingUserInput } from "../../session-logic";

const prompt: PendingUserInput = {
  requestId: RuntimeRequestId.make("request-1"),
  responseCapability: "live" as const,
  createdAt: "2026-08-15T00:00:00.000Z",
  questions: [
    {
      id: "question-1",
      header: "Approach",
      question: "Which approach should the migration take?",
      options: [
        { label: "Incremental", description: "Move one module at a time" },
        { label: "Big bang", description: "Move everything in one release" },
      ],
      multiSelect: false,
    },
  ],
  dismissible: true,
};

function renderPanel(pendingUserInput: PendingUserInput = prompt, cacheNote: string | null = null) {
  return renderToStaticMarkup(
    <ComposerPendingUserInputPanel
      cacheNote={cacheNote}
      pendingUserInputs={[pendingUserInput]}
      respondingRequestIds={[]}
      answers={{}}
      questionIndex={0}
      onToggleOption={() => {}}
      onAdvance={() => {}}
      onDismiss={() => {}}
    />,
  );
}

describe("ComposerPendingUserInputPanel", () => {
  it("renders the header as a disclosure control for the question body", () => {
    const markup = renderPanel();

    const toggle = markup.match(/<button[^>]*data-pending-user-input-toggle="[^"]*"[^>]*>/)?.[0];
    expect(toggle).toBeDefined();
    expect(toggle).toContain('data-pending-user-input-toggle="expanded"');
    expect(toggle).toContain('aria-expanded="true"');
    expect(toggle).toContain('type="button"');

    const controlledId = toggle?.match(/aria-controls="([^"]+)"/)?.[1];
    expect(controlledId).toBeDefined();
    expect(markup).toMatch(new RegExp(`<div[^>]*\\sid="${controlledId}"`));
  });

  it("shows the cache note only when one is given", () => {
    expect(renderPanel()).not.toContain("Cache ended");
    expect(
      renderPanel(prompt, "Cache ended while this waited. Your answer may cost more."),
    ).toContain("Cache ended while this waited.");
  });

  it("offers a visible Skip control for live and async questions", () => {
    expect(renderPanel()).toContain("data-pending-user-input-skip");
    const live = renderPanel({ ...prompt, dismissible: false });
    expect(live).toContain("data-pending-user-input-skip");
    expect(live).toContain(">Skip<");
    expect(
      renderPanel({ ...prompt, dismissible: false, responseCapability: "not_resumable" }),
    ).not.toContain("data-pending-user-input-skip");
  });

  it("starts expanded so the question and its options are visible", () => {
    const markup = renderPanel();

    expect(markup).toContain("Approach");
    expect(markup).toContain("Which approach should the migration take?");
    expect(markup).toContain("Incremental");
    expect(markup).toContain("Big bang");
  });

  it("keeps Skip as its own button, outside the disclosure button", () => {
    const markup = renderPanel();
    const toggleStart = markup.search(/<button[^>]*data-pending-user-input-toggle/);
    const toggleEnd = markup.indexOf("</button>", toggleStart);
    expect(markup.slice(toggleStart, toggleEnd)).not.toContain("Skip");
    expect(markup).toMatch(/<button[^>]*data-pending-user-input-skip/);
  });

  it("says that Submit is still needed when a typed note may go with the option", () => {
    expect(renderPanel()).toContain("then press Submit");
    const choiceOnly = renderPanel({
      ...prompt,
      questions: [{ ...prompt.questions[0]!, allowCustomAnswer: false }],
    });
    expect(choiceOnly).not.toContain("then press Submit");
  });

  it("uses crimson only for the recommended pill", () => {
    const recommended = renderPanel({
      ...prompt,
      questions: [
        {
          ...prompt.questions[0]!,
          options: [
            { label: "Incremental (Recommended)", description: "Move one module at a time" },
            { label: "Big bang", description: "Move everything in one release" },
          ],
        },
      ],
    });
    expect(recommended.match(/\btext-primary\b/g)).toHaveLength(1);
    expect(renderPanel().match(/\btext-primary\b/g)).toBeNull();
  });

  it("shows explanations at a readable size and hides key hints on phones", () => {
    const markup = renderPanel();
    expect(markup).toMatch(/text-sm[^"]*">Move one module at a time</);
    expect(markup).toMatch(/<kbd[^>]*max-sm:hidden/);
  });

  it("draws a border on each option so it reads as tappable", () => {
    const options = renderPanel().match(/<button[^>]*class="group [^"]*"/g) ?? [];
    expect(options).toHaveLength(2);
    for (const option of options) expect(option).toMatch(/\bborder\b/);
  });
});

import { describe, expect, it } from "@effect/vitest";

import { messageProblems } from "./guard-commit-message.ts";

const good = "Added a Guardrails table to new projects, so agents log hooks and lint rules.";

describe("messageProblems", () => {
  it("passes a visible fix with a plain note", () => {
    expect(messageProblems(`fix(chat): keep the draft\n\nRelease-Note: ${good}`, ".")).toEqual([]);
  });

  it("fails a note that is too long, as the merge queue would", () => {
    const long = `${good} It also covers every project in the whole workspace.`;
    const problems = messageProblems(`fix(chat): keep the draft\n\nRelease-Note: ${long}`, ".");
    expect(problems.join(" ")).toContain("use 8 to 18 words");
  });

  it("fails a visible fix with no note", () => {
    expect(messageProblems("fix(chat): keep the draft", ".")).toHaveLength(1);
  });

  it("lets internal work, a none note, a merge and comment lines through", () => {
    expect(messageProblems("docs(guardrails): fix a count", ".")).toEqual([]);
    expect(messageProblems("fix(chat): x\n\nRelease-Note: none", ".")).toEqual([]);
    expect(messageProblems("Merge branch 'a' into main", ".")).toEqual([]);
    expect(messageProblems("# only a comment", ".")).toEqual([]);
  });
});

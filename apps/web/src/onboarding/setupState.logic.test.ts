import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_SETUP_STATE,
  SETUP_ITEMS,
  brainScore,
  coderPreselect,
  markDone,
  openSetupItems,
  setupResumeSummary,
  type SetupState,
} from "./setupState.logic";

const allDone: SetupState = {
  ...EMPTY_SETUP_STATE,
  done: SETUP_ITEMS.map((item) => item.id),
  questionsAnswered: 5,
};

describe("brainScore", () => {
  it("is 0 for a fresh state and 100 when every item is done", () => {
    expect(brainScore(EMPTY_SETUP_STATE)).toBe(0);
    expect(brainScore(allDone)).toBe(100);
  });

  it("gives 5 points per quick question, up to 5", () => {
    expect(brainScore({ ...EMPTY_SETUP_STATE, questionsAnswered: 3 })).toBe(15);
    expect(brainScore({ ...EMPTY_SETUP_STATE, questionsAnswered: 9 })).toBe(25);
  });

  it("uses the settled weights", () => {
    const weights = Object.fromEntries(SETUP_ITEMS.map((item) => [item.id, item.points]));
    expect(weights).toMatchObject({
      basics: 10,
      account: 20,
      questions: 0,
      interview: 20,
      voice: 10,
      import: 10,
      skills: 5,
    });
  });

  it("ignores ids it does not know", () => {
    expect(brainScore({ ...EMPTY_SETUP_STATE, done: ["nope", "account"] })).toBe(20);
  });
});

describe("openSetupItems", () => {
  it("lists every item that is not done, so a skipped step is never lost", () => {
    const open = openSetupItems(markDone(EMPTY_SETUP_STATE, "basics")).map((item) => item.id);
    expect(open).not.toContain("basics");
    expect(open).toContain("account");
    expect(open).toContain("questions");
    expect(open).toContain("voice");
  });

  it("keeps the questions item open until 5 are answered", () => {
    const ids = (state: SetupState) => openSetupItems(state).map((item) => item.id);
    expect(ids({ ...EMPTY_SETUP_STATE, questionsAnswered: 4 })).toContain("questions");
    expect(ids({ ...EMPTY_SETUP_STATE, questionsAnswered: 5 })).not.toContain("questions");
  });

  it("is empty when everything is done", () => {
    expect(openSetupItems(allDone)).toEqual([]);
  });

  it("gives each item an ability line", () => {
    for (const item of SETUP_ITEMS) expect(item.ability.length).toBeGreaterThan(10);
  });
});

describe("markDone", () => {
  it("adds an id once", () => {
    const state = markDone(markDone(EMPTY_SETUP_STATE, "voice"), "voice");
    expect(state.done).toEqual(["voice"]);
  });
});

describe("coderPreselect", () => {
  it("says yes when a code editor is installed", () => {
    expect(coderPreselect(["file-manager", "vscode"])).toBe(true);
  });

  it("does not guess when only the file manager is found", () => {
    expect(coderPreselect(["file-manager"])).toBeNull();
    expect(coderPreselect([])).toBeNull();
  });
});

describe("setupResumeSummary", () => {
  it("stays hidden for people who never ran the new setup", () => {
    expect(setupResumeSummary(EMPTY_SETUP_STATE)).toBeNull();
  });

  it("counts finished items once setup started", () => {
    const state = { ...EMPTY_SETUP_STATE, startedAt: "2026-11-11", done: ["basics", "account"] };
    expect(setupResumeSummary(state)).toEqual({ done: 2, total: SETUP_ITEMS.length });
  });

  it("hides once every item is done", () => {
    expect(setupResumeSummary({ ...allDone, startedAt: "2026-11-11" })).toBeNull();
  });
});

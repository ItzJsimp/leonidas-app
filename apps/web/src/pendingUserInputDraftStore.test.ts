import { describe, expect, it } from "vite-plus/test";

import { usePendingUserInputDraftStore } from "./pendingUserInputDraftStore";

describe("pendingUserInputDraftStore", () => {
  it("keeps answers and question index after the owning view is gone", () => {
    const { setAnswers, setQuestionIndexes } = usePendingUserInputDraftStore.getState();
    setAnswers((existing) => ({ ...existing, k: { q1: { selectedOptionValues: ["a"] } } }));
    setQuestionIndexes((existing) => ({ ...existing, k: 2 }));

    const state = usePendingUserInputDraftStore.getState();
    expect(state.answersByRequestKey.k?.q1?.selectedOptionValues).toEqual(["a"]);
    expect(state.questionIndexByRequestKey.k).toBe(2);
  });

  it("does not notify when an updater returns the same object", () => {
    const before = usePendingUserInputDraftStore.getState();
    before.setAnswers((existing) => existing);
    expect(usePendingUserInputDraftStore.getState()).toBe(before);
  });

  it("keeps only the newest 50 requests", () => {
    const { setQuestionIndexes } = usePendingUserInputDraftStore.getState();
    setQuestionIndexes(() =>
      Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`r${i}`, i])),
    );
    setQuestionIndexes((existing) => ({ ...existing }));
    const indexes = usePendingUserInputDraftStore.getState().questionIndexByRequestKey;
    expect(Object.keys(indexes)).toHaveLength(50);
    expect(indexes.r59).toBe(59);
    expect(indexes.r0).toBeUndefined();
  });
});

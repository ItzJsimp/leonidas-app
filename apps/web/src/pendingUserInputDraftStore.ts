import { create } from "zustand";

import type { PendingUserInputDraftAnswer } from "./pendingUserInput";

type Updater<T> = (existing: T) => T;
type AnswersByRequestKey = Record<string, Record<string, PendingUserInputDraftAnswer>>;
type QuestionIndexByRequestKey = Record<string, number>;

// Question-card progress lives outside ChatView so it survives a remount
// (leaving for a new chat or a draft and coming back). Memory only: a request
// key is tied to one live request, so stale entries are never read again.
// shortcut: entries are never pruned, they are tiny; add pruning if sessions get huge.
interface PendingUserInputDraftStoreState {
  readonly answersByRequestKey: AnswersByRequestKey;
  readonly questionIndexByRequestKey: QuestionIndexByRequestKey;
  readonly setAnswers: (update: Updater<AnswersByRequestKey>) => void;
  readonly setQuestionIndexes: (update: Updater<QuestionIndexByRequestKey>) => void;
}

export const usePendingUserInputDraftStore = create<PendingUserInputDraftStoreState>()((set) => ({
  answersByRequestKey: {},
  questionIndexByRequestKey: {},
  setAnswers: (update) =>
    set((state) => {
      const next = update(state.answersByRequestKey);
      return next === state.answersByRequestKey ? state : { answersByRequestKey: next };
    }),
  setQuestionIndexes: (update) =>
    set((state) => {
      const next = update(state.questionIndexByRequestKey);
      return next === state.questionIndexByRequestKey ? state : { questionIndexByRequestKey: next };
    }),
}));

/**
 * First-run setup state: what is done, and the brain-strength score built from it.
 * A skipped step simply stays open, so the Finish-setup checklist always shows it.
 */
import * as Schema from "effect/Schema";

export const SETUP_STATE_STORAGE_KEY = "leonidas:setup-state";

export type SetupItemId =
  | "basics"
  | "account"
  | "questions"
  | "interview"
  | "import"
  | "voice"
  | "level"
  | "skills"
  | "laya";

export interface SetupItem {
  readonly id: SetupItemId;
  readonly label: string;
  /** What the AI cannot do until this is done, in its own voice. */
  readonly ability: string;
  /** Brain-strength points. The quick questions score per answer instead. */
  readonly points: number;
}

export const QUESTION_POINTS = 5;
/** The 4 asked quick questions plus the default answer style (quickAnswerCount). */
export const QUICK_QUESTION_COUNT = 5;

/** Checklist order. Weights settled by Jake on 2026-10-20; they sum to 100 with the questions.
 * 2026-11-07: the duplicate Groq "keys" item is gone, and its 5 points moved to voice (Jake). */
export const SETUP_ITEMS: readonly SetupItem[] = [
  {
    id: "basics",
    label: "Name your AI",
    ability: "I don't have a name or a home yet.",
    points: 10,
  },
  { id: "account", label: "Connect an AI account", ability: "I can't think yet.", points: 20 },
  {
    id: "questions",
    label: "Answer 4 quick questions",
    ability: "I don't know what you want from me yet.",
    points: 0,
  },
  {
    id: "interview",
    label: "Have your first chat",
    ability: "I don't know your work and your projects yet.",
    points: 20,
  },
  {
    id: "import",
    label: "Import memory from another AI",
    ability: "I don't know what your other AI knows about you yet.",
    points: 10,
  },
  { id: "voice", label: "Turn on voice", ability: "I can't hear you yet.", points: 10 },
  {
    id: "level",
    label: "Pick your AI level",
    ability: "I don't know how much to explain yet.",
    points: 0,
  },
  {
    id: "skills",
    label: "Add skills",
    ability: "I only know the basic ways to help you.",
    points: 5,
  },
  {
    id: "laya",
    label: "Turn on the safety check",
    ability: "I can't double-check risky steps yet.",
    points: 0,
  },
];

export const SetupStateSchema = Schema.Struct({
  done: Schema.Array(Schema.String),
  questionsAnswered: Schema.Number,
  coder: Schema.NullOr(Schema.Boolean),
  tourSeen: Schema.Boolean,
  /** Set when the new setup runs, so users from the old wizard get no surprise tour. */
  startedAt: Schema.NullOr(Schema.String),
  /** The user's own answers, shown on the tour's Memory stop. */
  memoryPreview: Schema.Array(Schema.String),
  /** The first task made from the goal answer, shown on the Tasks stop. */
  firstTask: Schema.NullOr(Schema.String),
});
export type SetupState = typeof SetupStateSchema.Type;

export const EMPTY_SETUP_STATE: SetupState = {
  done: [],
  questionsAnswered: 0,
  coder: null,
  tourSeen: false,
  startedAt: null,
  memoryPreview: [],
  firstTask: null,
};

function answeredQuestions(state: SetupState): number {
  return Math.min(Math.max(state.questionsAnswered, 0), QUICK_QUESTION_COUNT);
}

function isDone(state: SetupState, id: SetupItemId): boolean {
  if (id === "questions") return answeredQuestions(state) >= QUICK_QUESTION_COUNT;
  return state.done.includes(id);
}

export function brainScore(state: SetupState): number {
  const items = SETUP_ITEMS.reduce(
    (sum, item) => sum + (isDone(state, item.id) ? item.points : 0),
    0,
  );
  return items + answeredQuestions(state) * QUESTION_POINTS;
}

export function openSetupItems(state: SetupState): readonly SetupItem[] {
  return SETUP_ITEMS.filter((item) => !isDone(state, item.id));
}

export function markDone(state: SetupState, id: SetupItemId): SetupState {
  return state.done.includes(id) ? state : { ...state, done: [...state.done, id] };
}

/** A code editor on this machine means a builder: setup uses the deeper tour. Never guess "No". */
export function coderPreselect(editorIds: readonly string[]): boolean | null {
  return editorIds.some((id) => id !== "file-manager") ? true : null;
}

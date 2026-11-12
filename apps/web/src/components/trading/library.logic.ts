import type {
  TradingLibraryIndexResult,
  TradingLibrarySearchResult,
  TradingResourceSaveInput,
} from "@t3tools/contracts";

export type LibraryHit = TradingLibrarySearchResult["hits"][number];
export type LibraryFirm = TradingLibraryIndexResult["firms"][number];
export type ResourceKind = TradingResourceSaveInput["kind"];
/** A checked resource, ready for the save RPC (the workspace is added by the caller). */
export type ResourceSaveValue = Omit<TradingResourceSaveInput, "workspaceId">;

export const LIBRARY_SECTIONS = [
  { id: "course", label: "Course" },
  { id: "knowledge", label: "Knowledge" },
  { id: "flashcards", label: "Flashcards" },
  { id: "quiz", label: "Quiz" },
  { id: "community", label: "Community" },
  { id: "firms", label: "Firms" },
  { id: "saved", label: "Saved" },
] as const;

export const RESOURCE_KINDS: ReadonlyArray<{
  readonly value: ResourceKind;
  readonly label: string;
}> = [
  { value: "link", label: "Link" },
  { value: "note", label: "Note" },
  { value: "pdf", label: "PDF (as a link or note)" },
  { value: "discord", label: "Discord" },
  { value: "call", label: "Call" },
];

const KIND_ORDER = ["lesson", "knowledge", "card", "community"] as const;
const KIND_LABEL: Record<LibraryHit["kind"], string> = {
  lesson: "Lessons",
  knowledge: "Knowledge",
  card: "Cards",
  community: "Community",
};

/** Search hits in a fixed order of kinds. Kinds with no hit are left out. */
export function groupHits(hits: readonly LibraryHit[]) {
  return KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    hits: hits.filter((hit) => hit.kind === kind),
  })).filter((group) => group.hits.length > 0);
}

/** A firm page notice. A stale page shows its fetch date, so the trader sees how old it is. */
export function firmNotice(firm: LibraryFirm): {
  readonly tone: "stale" | "fresh" | "unknown";
  readonly text: string;
} {
  if (firm.fetchDate === null) {
    return { tone: "unknown", text: "Fetch date unknown. Check the rules before you trade." };
  }
  if (firm.stale) {
    return {
      tone: "stale",
      text: `Fetched ${firm.fetchDate}. This page is older than 30 days. Check the rules again.`,
    };
  }
  return { tone: "fresh", text: `Fetched ${firm.fetchDate}.` };
}

/** Answers given so far, keyed by question position, and how many of them are right. */
export function quizScore(
  questions: ReadonlyArray<{ readonly correct: number }>,
  picked: Readonly<Record<number, number>>,
) {
  let answered = 0;
  let correct = 0;
  questions.forEach((question, index) => {
    const choice = picked[index];
    if (choice === undefined) return;
    answered += 1;
    if (choice === question.correct) correct += 1;
  });
  return { answered, correct, total: questions.length };
}

/** The next flashcard. The deck wraps to the first card after the last. */
export function nextIndex(current: number, total: number): number {
  return total === 0 ? 0 : (current + 1) % total;
}

/** The prompt that opens a new Leonidas Chat thread about one lesson. */
export function coachPrompt(lessonTitle: string): string {
  return `Teach me the lesson "${lessonTitle}" from my trading course. Explain the main idea in plain words, then give one example.`;
}

/** The app path that opens a new thread with the prompt placed in it. */
export function coachLink(prompt: string): string {
  return `/new?${new URLSearchParams({ prompt }).toString()}`;
}

export interface ResourceDraft {
  readonly kind: ResourceKind;
  readonly title: string;
  readonly url: string;
  readonly text: string;
  /** On by default. Off keeps the resource private to this PC. */
  readonly shareWithCrew: boolean;
}

/** Checks the form and returns the RPC input, or the first thing to fix. */
export function resourceInput(
  draft: ResourceDraft,
):
  | { readonly ok: true; readonly value: ResourceSaveValue }
  | { readonly ok: false; readonly error: string } {
  const title = draft.title.trim();
  const url = draft.url.trim();
  const text = draft.text.trim();
  if (title === "") return { ok: false, error: "Add a title." };
  if (title.length > 200) return { ok: false, error: "Keep the title to 200 characters." };
  if (draft.kind === "link" && url === "") return { ok: false, error: "Add the link." };
  if (url !== "" && !/^https?:\/\//i.test(url)) {
    return { ok: false, error: "The link must start with https:// or http://." };
  }
  if (url.length > 2_000) return { ok: false, error: "The link is too long." };
  if (url === "" && text === "") return { ok: false, error: "Add a link or some text." };
  if (text.length > 20_000) return { ok: false, error: "Keep the text to 20,000 characters." };
  return {
    ok: true,
    value: {
      kind: draft.kind,
      title,
      url: url === "" ? undefined : url,
      text: text === "" ? undefined : text,
      private: !draft.shareWithCrew,
    },
  };
}

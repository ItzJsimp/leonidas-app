import type {
  BranchNamingOptions,
  ChatAttachment,
  ModelSelection,
  PullRequestReviewGuide,
  TextGenerationError,
  ThreadGoalVerdict,
} from "@t3tools/contracts";
import type * as Effect from "effect/Effect";

import type { SkillPickInput, SkillPickResult } from "./skillPick.ts";
import type { TextGenerationPolicy } from "./textGenerationPolicy.ts";

export type { SkillPickCandidate, SkillPickInput, SkillPickResult } from "./skillPick.ts";

export interface CommitMessageGenerationInput {
  cwd: string;
  branch: string | null;
  stagedSummary: string;
  stagedPatch: string;
  includeBranch?: boolean;
  policy?: TextGenerationPolicy | undefined;
  modelSelection: ModelSelection;
}

export interface CommitMessageGenerationResult {
  subject: string;
  body: string;
  branch?: string | undefined;
}

export interface PrContentGenerationInput {
  cwd: string;
  baseBranch: string;
  headBranch: string;
  commitSummary: string;
  diffSummary: string;
  diffPatch: string;
  changeRequestTemplate?: string | undefined;
  threadContext?: string | undefined;
  policy?: TextGenerationPolicy | undefined;
  modelSelection: ModelSelection;
}

export interface PrContentGenerationResult {
  title: string;
  body: string;
}

export interface BranchNameGenerationInput {
  naming?: BranchNamingOptions | undefined;
  cwd: string;
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  modelSelection: ModelSelection;
}

export interface BranchNameGenerationResult {
  branch: string;
}

export interface ThreadTitleGenerationInput {
  linkedContext?: string | undefined;
  cwd: string;
  message: string;
  previousTitle?: string | undefined;
  /** Optional user focus for a regenerated title. */
  hint?: string | undefined;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  /** User instructions for how titles are written. */
  instructions?: string | undefined;
  /** What model and provider to use for generation. */
  modelSelection: ModelSelection;
}

export interface ThreadTitleGenerationResult {
  title: string;
  needsRefinement?: boolean | undefined;
}

export interface ReviewGuideStackLayer {
  readonly number: number;
  readonly title: string | null;
  readonly headSha: string | null;
  readonly state: "open" | "closed" | "merged";
}

export interface ReviewGuideGenerationInput {
  cwd: string;
  number: number;
  title: string;
  description: string;
  baseBranch: string;
  baseCommit: string;
  settledReview: string;
  instructions?: string | undefined;
  stack?: ReadonlyArray<ReviewGuideStackLayer> | undefined;
  modelSelection: ModelSelection;
}

export type ReviewGuideGenerationResult = Omit<
  PullRequestReviewGuide,
  "headSha" | "generatedAt" | "modelSelection"
>;

export interface PromptSuggestionMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
}

export interface PromptSuggestionInput {
  cwd: string;
  /** Recent finished chat messages, oldest first. */
  messages: ReadonlyArray<PromptSuggestionMessage>;
  /** Exact composer text already typed by the user. */
  draft?: string;
  personalExamples?: readonly string[];
  /** What model and provider to use for generation. */
  modelSelection: ModelSelection;
}

export interface PromptSuggestionResult {
  /** The predicted next user message, or null when no confident prediction exists. */
  prompt: string | null;
}

export interface ThreadAssessmentInput {
  cwd: string;
  /** The end of the chat as plain text. The model treats it as data. */
  transcript: string;
  /** "class" judges the chat; "handoff" also writes a prompt that continues it in a new chat. */
  want: "class" | "handoff";
  modelSelection: ModelSelection;
}

export interface ThreadAssessmentResult {
  verdict: "done" | "unfinished" | "unsure";
  reason: string;
  /** The handoff prompt when `want` was "handoff"; an empty string otherwise. */
  handoff: string;
}

/** Commit, change request, branch, and title generation backed by one provider instance. */
export interface ProviderTextGeneration {
  readonly generateVoiceLogDraft?: (input: {
    cwd: string;
    texts: ReadonlyArray<string>;
    modelSelection: ModelSelection;
  }) => Effect.Effect<{ lines: ReadonlyArray<string> }, TextGenerationError>;
  /** Predict the user's next message from the chat so far. */
  readonly generatePromptSuggestion?: (
    input: PromptSuggestionInput,
  ) => Effect.Effect<PromptSuggestionResult, TextGenerationError>;

  /** Choose which of a shortlist of skills the agent should load for a request. */
  readonly pickSkills?: (
    input: SkillPickInput,
  ) => Effect.Effect<SkillPickResult, TextGenerationError>;

  /** Judge whether a chat is finished, or write the prompt that continues it. */
  readonly assessThread?: (
    input: ThreadAssessmentInput,
  ) => Effect.Effect<ThreadAssessmentResult, TextGenerationError>;

  readonly evaluateGoal?: (input: {
    cwd: string;
    condition: string;
    transcript: string;
    modelSelection: ModelSelection;
  }) => Effect.Effect<ThreadGoalVerdict, TextGenerationError>;

  /**
   * Generate a commit message from staged change context.
   */
  readonly generateCommitMessage: (
    input: CommitMessageGenerationInput,
  ) => Effect.Effect<CommitMessageGenerationResult, TextGenerationError>;

  readonly generatePrContent: (
    input: PrContentGenerationInput,
  ) => Effect.Effect<PrContentGenerationResult, TextGenerationError>;

  readonly generateBranchName: (
    input: BranchNameGenerationInput,
  ) => Effect.Effect<BranchNameGenerationResult, TextGenerationError>;

  readonly generateThreadTitle: (
    input: ThreadTitleGenerationInput,
  ) => Effect.Effect<ThreadTitleGenerationResult, TextGenerationError>;

  readonly generateReviewGuide: (
    input: ReviewGuideGenerationInput,
  ) => Effect.Effect<ReviewGuideGenerationResult, TextGenerationError>;
}

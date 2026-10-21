/** 0 Watch, 1 Sort, 2 Draft, 3 Approve-to-send, 4 Auto-send. Tiers 3 and 4 act like 2 until a send path exists. */
export const AUTONOMY_TIERS = [0, 1, 2, 3, 4] as const;
export type AutonomyTier = (typeof AUTONOMY_TIERS)[number];

/** Closed on purpose: the engine can label, archive, draft and flag. It cannot send. */
export const ACTION_TYPES = ["label", "archive", "draft", "surface", "needsReview"] as const;

export type Action =
  | { readonly type: "label"; readonly labels: readonly string[] }
  | { readonly type: "archive" }
  | { readonly type: "draft"; readonly subject: string; readonly body: string }
  | { readonly type: "surface"; readonly reason: string }
  | { readonly type: "needsReview" };

/** Bucket for mail that no rule placed. The later LLM step reads this bucket. */
export const REVIEW_BUCKET = "review";

export interface MailMessage {
  readonly id: string;
  readonly threadId: string;
  /** Display name, may be empty. */
  readonly fromName: string;
  readonly fromAddress: string;
  readonly subject: string;
  readonly snippet: string;
  readonly attachmentNames: readonly string[];
  readonly listUnsubscribe: boolean;
  /** Label names already on the message. */
  readonly labels: readonly string[];
  /** Sent by the mailbox owner. */
  readonly isOwn: boolean;
  /** The mailbox owner already replied somewhere in this thread. */
  readonly ownRepliedInThread: boolean;
}

/** A rule matches when ANY of its conditions matches. */
export interface RuleMatch {
  /** Words or phrases in subject plus snippet. A trailing `*` means "starts with". */
  readonly keywords?: readonly string[];
  /** Same syntax, tested on the sender name and address. */
  readonly fromKeywords?: readonly string[];
  /** Same syntax, tested on each attachment file name. */
  readonly attachmentKeywords?: readonly string[];
  readonly listUnsubscribe?: boolean;
  readonly ownRepliedInThread?: boolean;
}

export interface Rule {
  readonly id: string;
  readonly bucket: string;
  readonly match: RuleMatch;
}

export interface DraftTemplate {
  /** Body text. `{{firstName}}` is the only placeholder. */
  readonly body: string;
}

export interface Pack {
  readonly id: string;
  readonly name: string;
  /** First match wins, so put the costliest misses first. */
  readonly rules: readonly Rule[];
  /** Labels to apply per bucket, including `review`. */
  readonly labels: Readonly<Record<string, readonly string[]>>;
  /** Draft template per bucket. */
  readonly drafts: Readonly<Record<string, DraftTemplate>>;
  /** Buckets that never get a draft at any tier. */
  readonly neverDraft: readonly string[];
  /** Buckets that are always shown to the user and never archived. */
  readonly alwaysSurface: readonly string[];
  /** Buckets archived from tier 1 up. */
  readonly archive: readonly string[];
}

/** `bucket: null` means skipped (own mail or already handled). `ruleId: null` with `review` means no rule matched. */
export interface Decision {
  readonly bucket: string | null;
  readonly ruleId: string | null;
  readonly reason: string;
}

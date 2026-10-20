/** The 4-card basics primer. Setup shows it after the AI step; the Guide repeats it. */
export interface PrimerCard {
  readonly id: "model" | "switch" | "effort" | "skills";
  readonly title: string;
  readonly body: string;
}

export const PRIMER_CARDS: readonly PrimerCard[] = [
  {
    id: "model",
    title: "What a model is",
    body: "A model is the AI that writes the answers. Some models are fast. Other models think more and do hard work better.",
  },
  {
    id: "switch",
    title: "How to switch models",
    body: "The model menu is below the message box. Click it and pick a different model. You can switch at any time in a chat.",
  },
  {
    id: "effort",
    title: "Effort: keep the default",
    body: "Effort sets how long the AI thinks before it answers. More effort is slower and uses more of your plan. The default is correct for most work, so keep it.",
  },
  {
    id: "skills",
    title: "How skills work",
    body: "A skill is a saved set of steps for one type of job. The AI uses a skill when your message matches it. Type / in the message box to see your skills.",
  },
];

/** The practice menu on the "switch" card. Plain names, no real model is used. */
export const PRIMER_PRACTICE_MODELS = ["Fast model", "Strong model"] as const;

export const PRIMER_STORAGE_KEY = "leonidas:primer";
export type PrimerResult = "done" | "skipped";

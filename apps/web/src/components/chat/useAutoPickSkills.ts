import {
  WS_METHODS,
  type AutoPickEngine,
  type EnvironmentId,
  type ServerProviderSkill,
} from "@t3tools/contracts";
import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import { useCallback, useEffect, useRef, useState } from "react";

import { connectionAtomRuntime } from "../../connection/runtime";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import { toastManager } from "../ui/toast";
import {
  autoPickSkills,
  describeEngine,
  describeNone,
  describePicks,
  type AskModel,
  type ModelAnswer,
  type ModelEngine,
  type ModelRequest,
} from "./composerAutoPick";
import {
  mentionedSkillNames,
  prefixPromptWithSkills,
  withoutSkillMentions,
} from "./composerSkillPrefix";
import { rankSkills } from "./composerSkillSuggest";

/** The nudge waits for a draft this long: shorter ones rarely need a skill. */
const MIN_WORDS = 6;
/** The nudge waits for the user to stop typing, so it never flickers mid-sentence. */
const NUDGE_IDLE_MS = 1_500;

const pickQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:auto-pick-skills",
  tag: WS_METHODS.projectsPickSkills,
  staleTimeMs: 0,
  idleTtlMs: 60_000,
});

/** The toast detail: the picks, then who made them, so nobody has to wonder which model ran. */
function describeSource(
  outcome: {
    by: "model" | "keyword";
    engine?: ModelEngine | undefined;
    model?: string | undefined;
  },
  summary: string,
  setting: AutoPickEngine,
): string {
  if (outcome.by === "model") {
    const via = describeEngine(outcome.engine, outcome.model);
    return via ? `${summary}. Picked by ${via}.` : summary;
  }
  return setting === "keyword"
    ? summary
    : `${summary}. Matched by keywords because no model answered. Set up a free model in Settings.`;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Reads the draft, picks the skills it needs and leads the draft with them, as if the user had
 * typed each `$skill`. Running it again picks again for the current text and replaces its own
 * earlier picks. A toast offers Undo. The plus menu calls `pick`.
 */
export function useAutoPickSkills(props: {
  environmentId: EnvironmentId;
  /** The project folder. Without one the model cannot run, so the keyword pick answers. */
  cwd: string | null;
  prompt: string;
  /** Extra words that describe the project, such as its folder name. */
  projectText: string;
  skills: ReadonlyArray<ServerProviderSkill>;
  cap: number;
  /** Which engine to ask, and the model to run on each. Set in Settings. */
  engine: AutoPickEngine;
  openRouterModel: string;
  groqModel: string;
  localModel: string;
  getPrompt: () => string;
  setPrompt: (next: string) => void;
}) {
  const {
    environmentId,
    cwd,
    prompt,
    projectText,
    skills,
    cap,
    engine,
    openRouterModel,
    groqModel,
    localModel,
    getPrompt,
    setPrompt,
  } = props;
  const [busy, setBusy] = useState(false);
  /** The draft text the nudge was judged for; any edit makes it stale and hides the nudge. */
  const [nudgedFor, setNudgedFor] = useState<string | null>(null);
  /** Blocks a second click before the first one has re-rendered. */
  const busyRef = useRef(false);
  /** The `$skill ` chips the last click put at the start of the draft. */
  const leadRef = useRef<string | null>(null);
  /** The last model answer, so a repeat click on the same text is instant, free and identical. */
  const cacheRef = useRef<{ key: string; answer: ModelAnswer } | null>(null);
  const runPick = useAtomQueryRunner(pickQuery, { reportFailure: false, refresh: true });

  const hasText = prompt.trim().length > 0;
  const words = countWords(withoutSkillMentions(prompt));
  const nudge = !busy && nudgedFor === prompt;

  // Nudge: a draft with no skill that the free keyword pass says could use one.
  useEffect(() => {
    if (words < MIN_WORDS || mentionedSkillNames(prompt).length > 0) return;
    const timer = window.setTimeout(
      () =>
        setNudgedFor(rankSkills({ prompt, projectText, skills, cap }).length > 0 ? prompt : null),
      NUDGE_IDLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [cap, projectText, prompt, skills, words]);

  const askModel = useCallback<AskModel>(
    async (request: ModelRequest) => {
      // "Keywords only" never asks a model. Changing an engine setting changes the cache key.
      if (!cwd || engine === "keyword") return null;
      const full = { ...request, engine, openRouterModel, groqModel, localModel };
      const key = JSON.stringify(full);
      if (cacheRef.current?.key === key) return cacheRef.current.answer;
      const result = await runPick({ environmentId, input: { cwd, ...full } });
      if (result._tag !== "Success") return null;
      if (result.value.modelUsed) cacheRef.current = { key, answer: result.value };
      return result.value;
    },
    [cwd, engine, environmentId, groqModel, localModel, openRouterModel, runPick],
  );

  const pick = useCallback(async () => {
    if (busyRef.current) return;
    const current = getPrompt();
    if (current.trim().length === 0) {
      toastManager.add({
        type: "info",
        title: "Write your message first",
        description: "Auto-pick skills reads it and adds the skills it needs.",
      });
      return;
    }
    // Drop the chips an earlier click added, so this click judges the text on its own.
    const previousLead = leadRef.current;
    const base =
      previousLead && current.startsWith(previousLead)
        ? current.slice(previousLead.length)
        : current;

    busyRef.current = true;
    setBusy(true);
    let outcome;
    try {
      outcome = await autoPickSkills({ prompt: base, projectText, skills, cap, askModel });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    if (getPrompt() !== current) {
      toastManager.add({
        type: "info",
        title: "Your message changed",
        description: "Choose Auto-pick skills again to pick for the new text.",
      });
      return;
    }
    if (outcome.kind === "full") {
      toastManager.add({
        type: "info",
        title: `Already at ${outcome.cap} ${outcome.cap === 1 ? "skill" : "skills"}`,
        description: "Remove one, or raise the limit in Settings.",
      });
      return;
    }
    if (outcome.kind === "none") {
      toastManager.add({ type: "info", ...describeNone(outcome) });
      return;
    }

    const names = outcome.picks.map((item) => item.name);
    const next = prefixPromptWithSkills(base, names);
    const lead = next.slice(0, next.length - base.length);
    const summary = describePicks(outcome.picks);
    if (next === current) {
      toastManager.add({ type: "info", title: "Already the best fit", description: summary });
      return;
    }
    setPrompt(next);
    leadRef.current = lead;
    toastManager.add({
      type: "info",
      title: `Added ${names.length} ${names.length === 1 ? "skill" : "skills"}`,
      description: describeSource(outcome, summary, engine),
      actionProps: {
        children: "Undo",
        onClick: () => {
          const now = getPrompt();
          if (now === next) {
            setPrompt(current);
            leadRef.current = previousLead;
          } else if (now.startsWith(lead)) {
            setPrompt(now.slice(lead.length));
            leadRef.current = null;
          }
        },
      },
    });
  }, [askModel, cap, engine, getPrompt, projectText, setPrompt, skills]);

  return { pick, busy, hasText, nudge };
}

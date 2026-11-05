import { WS_METHODS, type EnvironmentId, type ServerProviderSkill } from "@t3tools/contracts";
import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import * as Schema from "effect/Schema";
import { WandSparklesIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { connectionAtomRuntime } from "../../connection/runtime";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import { Button } from "../ui/button";
import { Popover, PopoverPopup } from "../ui/popover";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  autoPickSkills,
  describePicks,
  type AskModel,
  type ModelAnswer,
  type ModelRequest,
} from "./composerAutoPick";
import { ComposerBanner } from "./ComposerBanner";
import {
  mentionedSkillNames,
  prefixPromptWithSkills,
  withoutSkillMentions,
} from "./composerSkillPrefix";
import { rankSkills } from "./composerSkillSuggest";

const INTRO_SEEN_KEY = "leonidas:auto-pick-skills:intro-seen";
/** The first-use note and the nudge wait for a draft this long: shorter ones rarely need a skill. */
const MIN_WORDS = 6;
/** The nudge waits for the user to stop typing, so it never flickers mid-sentence. */
const NUDGE_IDLE_MS = 1_500;

const pickQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:auto-pick-skills",
  tag: WS_METHODS.projectsPickSkills,
  staleTimeMs: 0,
  idleTtlMs: 60_000,
});

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Shoulder tab that reads the draft, picks the skills it needs and leads the draft with
 * them, as if the user had typed each `$skill`. Clicking again picks again for the
 * current text and replaces its own earlier picks. A toast offers Undo.
 */
export const ComposerAutoPickSkillsButton = memo(function ComposerAutoPickSkillsButton(props: {
  environmentId: EnvironmentId;
  /** The project folder. Without one the model cannot run, so the keyword pick answers. */
  cwd: string | null;
  prompt: string;
  /** Extra words that describe the project, such as its folder name. */
  projectText: string;
  skills: ReadonlyArray<ServerProviderSkill>;
  cap: number;
  getPrompt: () => string;
  setPrompt: (next: string) => void;
}) {
  const { environmentId, cwd, prompt, projectText, skills, cap, getPrompt, setPrompt } = props;
  const [busy, setBusy] = useState(false);
  /** The draft text the nudge was judged for; any edit makes it stale and hides the nudge. */
  const [nudgedFor, setNudgedFor] = useState<string | null>(null);
  /** Blocks a second click before the first one has re-rendered. */
  const busyRef = useRef(false);
  const [introSeen, setIntroSeen] = useLocalStorage(INTRO_SEEN_KEY, false, Schema.Boolean);
  const rowRef = useRef<HTMLDivElement>(null);
  /** The `$skill ` chips the last click put at the start of the draft. */
  const leadRef = useRef<string | null>(null);
  /** The last model answer, so a repeat click on the same text is instant, free and identical. */
  const cacheRef = useRef<{ key: string; answer: ModelAnswer } | null>(null);
  const runPick = useAtomQueryRunner(pickQuery, { reportFailure: false, refresh: true });

  const hasText = prompt.trim().length > 0;
  const words = countWords(withoutSkillMentions(prompt));
  const showIntro = !introSeen && !busy && words >= MIN_WORDS;
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
      if (!cwd) return null;
      const key = JSON.stringify(request);
      if (cacheRef.current?.key === key) return cacheRef.current.answer;
      const result = await runPick({ environmentId, input: { cwd, ...request } });
      if (result._tag !== "Success") return null;
      if (result.value.modelUsed) cacheRef.current = { key, answer: result.value };
      return result.value;
    },
    [cwd, environmentId, runPick],
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
    setIntroSeen(true);
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
        description: "Click Auto-pick skills again to pick for the new text.",
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
      toastManager.add({
        type: "info",
        title: outcome.by === "model" ? "No skill needed" : "No skill matched",
        description: "Nothing fits this message well. Use Skills to add one by hand.",
      });
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
      description:
        outcome.by === "keyword"
          ? `${summary}. Matched by keywords because the model did not answer.`
          : summary,
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
  }, [askModel, cap, getPrompt, projectText, setIntroSeen, setPrompt, skills]);

  return (
    <>
      <ComposerBanner.Root density="comfortable" width="content" data-composer-shoulder-tab>
        <Tooltip>
          <TooltipTrigger
            render={
              <ComposerBanner.Row
                ref={rowRef}
                render={<button type="button" onClick={pick} />}
                aria-label="Auto-pick skills: add the skills this message needs"
                aria-disabled={!hasText || busy}
                data-tour="composer-auto-pick-skills"
                className={
                  hasText && !busy
                    ? "relative touch-hit text-muted-foreground transition-colors duration-200 hover:text-foreground data-[nudge]:text-foreground"
                    : "relative touch-hit text-muted-foreground opacity-60"
                }
                data-nudge={nudge ? "" : undefined}
                onPointerDown={(event) => event.preventDefault()}
              />
            }
          >
            <ComposerBanner.Icon>{busy ? <Spinner /> : <WandSparklesIcon />}</ComposerBanner.Icon>
            <ComposerBanner.Content>
              {busy ? "Picking…" : "Auto-pick skills"}
            </ComposerBanner.Content>
            {nudge ? (
              <span
                aria-hidden
                className="absolute top-1.5 right-1 size-1.5 rounded-full bg-primary"
              />
            ) : null}
          </TooltipTrigger>
          <TooltipPopup side="top">
            <div className="max-w-64 space-y-1 text-left">
              <p className="font-medium">
                {nudge ? "Skills fit this message. Click to add them." : "Auto-pick skills"}
              </p>
              <p className="text-muted-foreground">
                Reads your message and adds the skills it needs. Changed your message? Click again
                to pick again.
              </p>
            </div>
          </TooltipPopup>
        </Tooltip>
      </ComposerBanner.Root>
      <Popover open={showIntro} onOpenChange={(open) => !open && setIntroSeen(true)}>
        <PopoverPopup
          anchor={rowRef}
          side="top"
          align="start"
          width="sm"
          padding="compact"
          initialFocus={false}
          finalFocus={false}
        >
          <div className="space-y-2 text-sm">
            <p className="font-medium">New: Auto-pick skills</p>
            <p className="text-muted-foreground">
              Click it and it reads your message, then adds the skills the agent needs. Click again
              after you edit the message.
            </p>
            <Button size="xs" onClick={() => setIntroSeen(true)}>
              Got it
            </Button>
          </div>
        </PopoverPopup>
      </Popover>
    </>
  );
});

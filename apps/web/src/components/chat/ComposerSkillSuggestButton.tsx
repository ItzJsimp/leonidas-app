import type { ServerProviderSkill } from "@t3tools/contracts";
import { WandSparklesIcon } from "lucide-react";
import { memo, useCallback } from "react";

import { toastManager } from "../ui/toast";
import { ComposerBanner } from "./ComposerBanner";
import { prefixPromptWithSkills } from "./composerSkillPrefix";
import { rankSkills } from "./composerSkillSuggest";

/**
 * Shoulder tab that reads the draft, picks the best skills for it and leads the draft
 * with them, as if the user had typed each `$skill`. A toast offers Undo.
 */
export const ComposerSkillSuggestButton = memo(function ComposerSkillSuggestButton(props: {
  prompt: string;
  /** Extra words that describe the project, such as its folder name. */
  projectText: string;
  skills: ReadonlyArray<ServerProviderSkill>;
  cap: number;
  getPrompt: () => string;
  setPrompt: (next: string) => void;
}) {
  const { prompt, projectText, skills, cap, getPrompt, setPrompt } = props;
  const suggest = useCallback(() => {
    const picks = rankSkills({ prompt, projectText, skills, cap });
    if (picks.length === 0) {
      toastManager.add({ type: "info", title: "No skill fits this message" });
      return;
    }
    const next = prefixPromptWithSkills(
      prompt,
      picks.map((pick) => pick.name),
    );
    const leadChips = next.slice(0, next.length - prompt.length);
    setPrompt(next);
    toastManager.add({
      type: "info",
      title: `Added ${picks.length} ${picks.length === 1 ? "skill" : "skills"}`,
      description: picks.map((pick) => `$${pick.name}`).join(" "),
      actionProps: {
        children: "Undo",
        onClick: () => {
          const current = getPrompt();
          if (current.startsWith(leadChips)) setPrompt(current.slice(leadChips.length));
        },
      },
    });
  }, [cap, getPrompt, projectText, prompt, setPrompt, skills]);

  return (
    <ComposerBanner.Root density="comfortable" width="content" data-composer-shoulder-tab>
      <ComposerBanner.Row
        render={<button type="button" disabled={prompt.trim().length === 0} onClick={suggest} />}
        aria-label="Suggest skills: add the best skills for this message"
        className="relative touch-hit text-muted-foreground transition-colors duration-200 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        onPointerDown={(event) => event.preventDefault()}
      >
        <ComposerBanner.Icon>
          <WandSparklesIcon />
        </ComposerBanner.Icon>
        <ComposerBanner.Content>Suggest</ComposerBanner.Content>
      </ComposerBanner.Row>
    </ComposerBanner.Root>
  );
});

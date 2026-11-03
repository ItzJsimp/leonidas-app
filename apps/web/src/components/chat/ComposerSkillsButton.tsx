import type { ServerProviderSkill } from "@t3tools/contracts";
import { formatProviderSkillDisplayName } from "@t3tools/shared/inlineSkills";
import { SparklesIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";

import { searchProviderSkills } from "../../providerSkillSearch";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ScrollArea } from "../ui/scroll-area";
import { ComposerBanner } from "./ComposerBanner";

/**
 * Shoulder tab that opens a searchable library of the skills the current agent can start in
 * this project. Picking one hands its name to `onSelect`; the composer decides where it goes.
 */
export const ComposerSkillsButton = memo(function ComposerSkillsButton(props: {
  skills: ReadonlyArray<ServerProviderSkill>;
  /** Push the tab to the right edge when no later tab does it. */
  alignRight: boolean;
  onSelect: (skillName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchProviderSkills(props.skills, query), [props.skills, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <ComposerBanner.Root
        density="comfortable"
        width="content"
        data-composer-shoulder-tab
        className={props.alignRight ? "ml-auto" : undefined}
      >
        <PopoverTrigger
          render={<ComposerBanner.Row render={<button type="button" />} />}
          aria-label="Skills: add a skill to the start of your message"
          className="relative touch-hit text-muted-foreground transition-colors duration-200 hover:text-foreground"
          onPointerDown={(event) => event.preventDefault()}
        >
          <ComposerBanner.Icon>
            <SparklesIcon />
          </ComposerBanner.Icon>
          <ComposerBanner.Content>Skills</ComposerBanner.Content>
        </PopoverTrigger>
      </ComposerBanner.Root>
      <PopoverPopup side="top" align="end" className="w-80">
        <div className="p-2">
          <Input
            autoFocus
            value={query}
            placeholder="Search skills"
            aria-label="Search skills"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <ScrollArea className="max-h-72">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">No skills found</p>
          ) : (
            <ul className="flex flex-col pb-1">
              {results.map((skill) => (
                <li key={skill.name}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-0.5 px-3 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    onClick={() => {
                      props.onSelect(skill.name);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="truncate text-sm font-medium">
                      {formatProviderSkillDisplayName(skill)}
                    </span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {skill.shortDescription ?? skill.description ?? skill.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverPopup>
    </Popover>
  );
});

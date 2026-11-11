import type { ServerProviderSkill } from "@t3tools/contracts";
import { formatProviderSkillDisplayName } from "@t3tools/shared/inlineSkills";
import { memo, useMemo, useState } from "react";

import { searchProviderSkills } from "../../providerSkillSearch";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";

/**
 * Searchable library of the skills the current agent can start in this project. Picking one
 * hands its name to `onSelect`; the composer decides where it goes. The plus menu shows it.
 */
export const ComposerSkillsPanel = memo(function ComposerSkillsPanel(props: {
  skills: ReadonlyArray<ServerProviderSkill>;
  onSelect: (skillName: string) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchProviderSkills(props.skills, query), [props.skills, query]);

  return (
    <>
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
                  onClick={() => props.onSelect(skill.name)}
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
    </>
  );
});

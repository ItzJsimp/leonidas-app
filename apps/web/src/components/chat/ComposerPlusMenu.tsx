import type { ServerProviderSkill } from "@t3tools/contracts";
import {
  BookmarkIcon,
  FolderOpenIcon,
  ListTodoIcon,
  PaperclipIcon,
  PlusIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react";
import { memo, useRef, useState } from "react";

import { useFocusWidgetStore } from "../focus/focusWidgetStore";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "../ui/menu";
import { Popover, PopoverPopup } from "../ui/popover";
import { ComposerSkillsPanel } from "./ComposerSkillsPanel";
import type { useAutoPickSkills } from "./useAutoPickSkills";
import type { useDesktopSnips } from "./ComposerSnipButton";

/** The snips the menu lists; the folder holds the rest. */
const RECENT_SNIP_LIMIT = 3;

/**
 * The composer's one plus button. It holds everything that adds to a message: files, recent
 * snips, skills, the prompt library and the notepad.
 */
export const ComposerPlusMenu = memo(function ComposerPlusMenu(props: {
  onAttach: () => void;
  attachShortcutLabel: string | null;
  snips: ReturnType<typeof useDesktopSnips>;
  skills: ReadonlyArray<ServerProviderSkill>;
  onSelectSkill: (skillName: string) => void;
  autoPick: ReturnType<typeof useAutoPickSkills>;
  onOpenLibrary: () => void;
}) {
  const { snips, autoPick } = props;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const notepadVisible = useFocusWidgetStore((state) => state.visible);
  const setNotepadVisible = useFocusWidgetStore((state) => state.setVisible);

  return (
    <>
      <Menu onOpenChange={snips.loadRecent}>
        <MenuTrigger
          ref={triggerRef}
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="relative"
              data-tour="composer-plus-menu"
              aria-label="Add to your message"
              onPointerDown={(event) => event.preventDefault()}
            />
          }
        >
          <PlusIcon />
          {autoPick.nudge ? (
            <span
              aria-hidden
              data-nudge=""
              className="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
            />
          ) : null}
        </MenuTrigger>
        <MenuPopup align="start" side="top">
          <MenuItem onClick={props.onAttach}>
            <PaperclipIcon />
            Attach files
            {props.attachShortcutLabel ? (
              <MenuShortcut>{props.attachShortcutLabel}</MenuShortcut>
            ) : null}
          </MenuItem>
          {snips.available ? (
            <>
              <MenuSeparator />
              <MenuGroup>
                <MenuGroupLabel>Recent snips</MenuGroupLabel>
                {snips.recent === null ? (
                  <MenuItem disabled>Loading...</MenuItem>
                ) : snips.recent.length === 0 ? (
                  <MenuItem disabled>No snips yet. Take a snip to see it here.</MenuItem>
                ) : (
                  snips.recent.slice(0, RECENT_SNIP_LIMIT).map((snip) => (
                    <MenuItem key={snip.path} onClick={() => void snips.attachRecent(snip.path)}>
                      {snip.dataUrl ? (
                        <img
                          src={snip.dataUrl}
                          alt=""
                          className="h-8 w-12 rounded-sm object-cover"
                        />
                      ) : null}
                      <span className="truncate">{snip.name}</span>
                    </MenuItem>
                  ))
                )}
                <MenuItem onClick={snips.openFolder}>
                  <FolderOpenIcon />
                  View all
                </MenuItem>
              </MenuGroup>
            </>
          ) : null}
          <MenuSeparator />
          {props.skills.length > 0 ? (
            <>
              <MenuItem onClick={() => setSkillsOpen(true)}>
                <SparklesIcon />
                Skills
              </MenuItem>
              <MenuItem onClick={() => void autoPick.pick()}>
                <WandSparklesIcon />
                Auto-pick skills
              </MenuItem>
            </>
          ) : null}
          <MenuItem onClick={props.onOpenLibrary}>
            <BookmarkIcon />
            Prompt library
          </MenuItem>
          <MenuItem onClick={() => setNotepadVisible(!notepadVisible)}>
            <ListTodoIcon />
            {notepadVisible ? "Hide notepad" : "Show notepad"}
          </MenuItem>
        </MenuPopup>
      </Menu>
      <Popover open={skillsOpen} onOpenChange={setSkillsOpen}>
        <PopoverPopup anchor={triggerRef} side="top" align="start" className="w-80">
          <ComposerSkillsPanel
            skills={props.skills}
            onSelect={(name) => {
              props.onSelectSkill(name);
              setSkillsOpen(false);
            }}
          />
        </PopoverPopup>
      </Popover>
    </>
  );
});

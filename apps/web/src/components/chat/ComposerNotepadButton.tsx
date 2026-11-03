import { ListTodoIcon } from "lucide-react";
import { memo } from "react";

import { useFocusWidgetStore } from "../focus/focusWidgetStore";
import { ComposerBanner } from "./ComposerBanner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** The composer's Notepad button: one click shows the notepad, the next click hides it. */
export const ComposerNotepadButton = memo(function ComposerNotepadButton(props: {
  alignRight: boolean;
}) {
  const visible = useFocusWidgetStore((state) => state.visible);
  const setVisible = useFocusWidgetStore((state) => state.setVisible);
  return (
    <ComposerBanner.Root
      density="comfortable"
      width="content"
      data-composer-shoulder-tab
      className={props.alignRight ? "ml-auto" : undefined}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <ComposerBanner.Row
              render={<button type="button" />}
              data-tour="composer-next-action"
              aria-label={visible ? "Hide the notepad" : "Show the notepad"}
              aria-pressed={visible}
              className="relative touch-hit text-muted-foreground transition-colors duration-200 hover:text-foreground aria-pressed:text-foreground"
              onClick={() => setVisible(!visible)}
            />
          }
        >
          <ComposerBanner.Icon>
            <ListTodoIcon />
          </ComposerBanner.Icon>
          <ComposerBanner.Content>Notepad</ComposerBanner.Content>
        </TooltipTrigger>
        <TooltipPopup side="top">{visible ? "Hide the notepad" : "Show the notepad"}</TooltipPopup>
      </Tooltip>
    </ComposerBanner.Root>
  );
});

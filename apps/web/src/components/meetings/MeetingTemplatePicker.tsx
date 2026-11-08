import { ChevronDownIcon } from "lucide-react";

import { Button } from "../ui/button";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuTrigger,
} from "../ui/menu";
import type { MeetingTemplate } from "./meetings.logic";

const DESCRIPTIONS: Readonly<Record<string, string>> = {
  default: "Summary, decisions, actions and questions.",
  "client-call": "Needs, terms, objections and follow-ups.",
  "one-on-one": "Progress, concerns and commitments.",
  brainstorm: "Ideas, choices and experiments.",
};

export function MeetingTemplatePicker(props: {
  readonly templates: readonly MeetingTemplate[] | null;
  readonly error: string | null;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
  readonly onRetry: () => void;
}) {
  const { templates } = props;
  if (props.error !== null || templates?.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span role="status">
          {props.error !== null ? "Templates could not load." : "No templates available."}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={props.onRetry}
          title="Load the available notes templates again."
        >
          Retry templates
        </Button>
      </div>
    );
  }
  const name = templates?.find((item) => item.id === props.value)?.name ?? "Saved template";
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            disabled={props.disabled || templates === null}
            aria-label={templates === null ? "Loading notes templates" : `Notes template: ${name}`}
            title="Choose the template for the next notes run. Selection does not use AI."
          >
            {templates === null ? "Loading templates..." : `Template: ${name}`}
            <ChevronDownIcon aria-hidden />
          </Button>
        }
      />
      <MenuPopup align="end" aria-label="Notes templates">
        <MenuRadioGroup value={props.value} onValueChange={props.onChange}>
          {templates?.map((template) => (
            <MenuRadioItem key={template.id} value={template.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span>{template.name}</span>
                  {DESCRIPTIONS[template.id] ? (
                    <p className="text-xs text-muted-foreground">{DESCRIPTIONS[template.id]}</p>
                  ) : null}
                </div>
                <MenuRadioItemIndicator />
              </div>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <p className="max-w-64 px-2 py-2 text-xs text-muted-foreground">
          Choose a template, then press Write notes. Existing notes stay until you apply it.
        </p>
      </MenuPopup>
    </Menu>
  );
}

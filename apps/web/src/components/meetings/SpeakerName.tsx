import { useState } from "react";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

/**
 * A speaker name the user can change. Typing the name of another speaker merges the two, and
 * one click on "Same person as" does the same.
 */
export function SpeakerName(props: {
  readonly name: string;
  /** The other speakers of this meeting. */
  readonly others: readonly string[];
  readonly onRename: (from: string, to: string) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(props.name);
  const next = draft.trim();
  const merge = props.others.find((other) => other === next);
  const rename = (to: string) => {
    setOpen(false);
    if (to !== "" && to !== props.name) props.onRename(props.name, to);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) setDraft(props.name);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={props.disabled}
            aria-label={`Rename ${props.name}`}
            className={cn(
              "rounded-sm underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none",
              props.className,
            )}
          />
        }
      >
        {props.name}
      </PopoverTrigger>
      <PopoverPopup align="start" width="sm" padding="compact">
        <form
          className="flex flex-col gap-2 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            rename(next);
          }}
        >
          <Input
            autoFocus
            size="compact"
            aria-label="Speaker name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          {props.others.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">Same person as</p>
              <ul className="flex flex-wrap gap-1">
                {props.others.map((other) => (
                  <li key={other}>
                    <Button type="button" size="xs" variant="outline" onClick={() => rename(other)}>
                      {other}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button
            type="submit"
            size="xs"
            className="self-end"
            disabled={next === "" || next === props.name}
          >
            {merge !== undefined ? `Merge with ${merge}` : "Rename"}
          </Button>
        </form>
      </PopoverPopup>
    </Popover>
  );
}

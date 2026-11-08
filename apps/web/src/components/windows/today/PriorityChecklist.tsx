import { FileTextIcon } from "lucide-react";
import { useId } from "react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { cn } from "~/lib/utils";

import { Tip } from "../../twoState/Tip";
import type { PriorityView } from "./today.logic";

/**
 * Today's priorities as tick boxes. Click the box or the text, or press Space on the box. A
 * priority linked to a task card gets a button that opens the card file.
 */
export function PriorityChecklist({
  priorities,
  onToggle,
  cardPath,
  onOpenFile,
  dense = false,
}: {
  readonly priorities: ReadonlyArray<PriorityView>;
  readonly onToggle: (priority: PriorityView) => void;
  /** The card file of a linked task, AIOS-relative; null when it is not in this AIOS. */
  readonly cardPath?: (taskId: string) => string | null;
  readonly onOpenFile?: (path: string) => void;
  /** Tighter rows with titles only, for the Command Center card. */
  readonly dense?: boolean;
}) {
  const base = useId();
  return (
    <ul className="divide-y divide-border/60" aria-label="Today's priorities">
      {priorities.map((priority, index) => {
        const id = `${base}-${index}`;
        const path = priority.taskId && cardPath ? cardPath(priority.taskId) : null;
        const box = (
          <Checkbox
            className="mt-0.5"
            checked={priority.done}
            disabled={priority.locked !== null}
            aria-describedby={priority.detail && !dense ? `${id}-detail` : undefined}
            onCheckedChange={() => onToggle(priority)}
          />
        );
        return (
          <li
            key={priority.key}
            className={cn(
              "group flex min-w-0 items-start gap-3",
              dense ? "py-2" : "py-2.5",
              "first:pt-0 last:pb-0",
            )}
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
              {priority.locked ? (
                <Tip text={priority.locked}>
                  <span
                    tabIndex={0}
                    className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {box}
                  </span>
                </Tip>
              ) : (
                box
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-sm font-medium wrap-anywhere",
                    priority.done && "text-muted-foreground line-through",
                  )}
                >
                  {priority.title}
                </span>
                {priority.detail && !dense ? (
                  <span
                    id={`${id}-detail`}
                    className="block text-xs wrap-anywhere text-muted-foreground"
                  >
                    {priority.detail}
                  </span>
                ) : null}
              </span>
            </label>
            {path && onOpenFile ? (
              <Tip text={`Open the task card, ${path}`}>
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label={`Open the task card for ${priority.title}`}
                  onClick={() => onOpenFile(path)}
                >
                  <FileTextIcon aria-hidden />
                </Button>
              </Tip>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

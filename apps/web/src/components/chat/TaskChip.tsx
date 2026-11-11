import { taskPresence } from "@t3tools/shared/taskPresence";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";
import { useMemo } from "react";

import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { useThreadShells } from "~/state/entities";

import { ChecklistBar, PriorityBadge, StatusBadge } from "../taskBoard/TaskBadges";
import { isOpen } from "../taskBoard/taskBoard.logic";
import { useLinkedTask } from "./useLinkedTask";

/** The chat's task card beside its title: status, title and checklist, with a peek on click. */
export function TaskChip({ threadId }: { readonly threadId: string }) {
  const { task, update } = useLinkedTask(threadId, true);
  const navigate = useNavigate();
  const shells = useThreadShells();
  const chats = useMemo(
    () =>
      task ? taskPresence(task, new Map(shells.map((shell) => [shell.id as string, shell]))) : [],
    [shells, task],
  );
  if (!task) return null;
  const openCard = () => void navigate({ to: "/tasks", search: { task: task.id } });

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Task card: ${task.title}`}
            className="ml-1 inline-flex h-8 max-w-64 min-w-0 shrink-0 items-center gap-2 rounded-full border border-input bg-card px-2 text-xs text-foreground hover:bg-surface-raised focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:shrink"
          />
        }
      >
        <StatusBadge status={task.status} />
        <span className="hidden min-w-0 truncate md:inline">{task.title}</span>
        {task.checklist ? (
          <span className="hidden shrink-0 text-muted-foreground tabular-nums sm:inline">
            {task.checklist.done}/{task.checklist.total}
          </span>
        ) : null}
        <ChevronDownIcon
          aria-hidden
          className="hidden size-3.5 shrink-0 text-muted-foreground sm:block"
        />
      </PopoverTrigger>
      <PopoverPopup side="bottom" align="start" className="w-96">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {task.projectSlug ? (
              <span className="text-xs text-muted-foreground">{task.projectSlug}</span>
            ) : null}
          </div>
          <p className="text-sm font-semibold">{task.title}</p>
          <ChecklistBar checklist={task.checklist} />
          {chats.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Working now</p>
              {chats.map((chat) => (
                <div key={chat.threadId} className="flex items-center gap-2 text-xs">
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-state" />
                  <span className="min-w-0 truncate">
                    {chat.threadId === threadId ? "This chat" : chat.title}
                  </span>
                  <span className="ml-auto shrink-0 text-muted-foreground">{chat.model}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            {isOpen(task) ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void update(
                    { status: "done", note: "Marked done in chat" },
                    "Could not mark done",
                  )
                }
              >
                Mark done
              </Button>
            ) : null}
            <Button size="sm" onClick={openCard}>
              <ExternalLinkIcon aria-hidden />
              Open card
            </Button>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

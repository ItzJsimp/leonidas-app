import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { CheckIcon, Undo2Icon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { useComposerDraftStore } from "~/composerDraftStore";

import { ChecklistBar, StatusBadge } from "../taskBoard/TaskBadges";
import { lastNote } from "./linkedTask.logic";
import { useLinkedTask } from "./useLinkedTask";

/** Shows above the composer while this chat's card waits for review, so the user decides here. */
export function TaskReviewBlock(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  // The header chip polls the board for this chat; this block reads the same cache.
  const { task, update } = useLinkedTask(props.threadId, false);
  if (!task || task.status !== "review") return null;
  const note = lastNote(task);

  const sendBack = () => {
    void update({ status: "in_progress", note: "Sent back from chat" }, "Could not send back");
    useComposerDraftStore
      .getState()
      .setPrompt(scopeThreadRef(props.environmentId, props.threadId), "Sent back: ");
  };

  return (
    <section
      aria-label="Task ready for review"
      className="mb-2 overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <StatusBadge status={task.status} />
        <p className="min-w-0 truncate text-sm font-semibold">{task.title}</p>
        <div className="ml-auto shrink-0">
          <ChecklistBar checklist={task.checklist} />
        </div>
      </div>
      {note ? <p className="px-3.5 py-2.5 text-sm text-foreground">{note}</p> : null}
      <div className="flex justify-end gap-2 border-t border-border px-3.5 py-2.5">
        <Button variant="outline" size="sm" onClick={sendBack}>
          <Undo2Icon aria-hidden />
          Send back
        </Button>
        <Button
          size="sm"
          onClick={() =>
            void update({ status: "done", note: "Approved in chat" }, "Could not approve")
          }
        >
          <CheckIcon aria-hidden />
          Approve and close
        </Button>
      </div>
    </section>
  );
}

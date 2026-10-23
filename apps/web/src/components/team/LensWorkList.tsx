import type { TaskBoardTask, TaskBoardTeamMember } from "@t3tools/contracts";

import { ownerOf } from "../taskBoard/owner.logic";
import { statusLabel } from "../taskBoard/taskBoard.logic";

const SHOWN = 8;

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** The open tasks of the current Team lens, so a click on the map shows what it selected. */
export function LensWorkList(props: {
  readonly label: string;
  readonly tasks: ReadonlyArray<TaskBoardTask>;
  readonly team: ReadonlyArray<TaskBoardTeamMember>;
}) {
  const { label, tasks, team } = props;
  const shown = tasks.slice(0, SHOWN);
  return (
    <section aria-labelledby="team-lens-work-title" className="space-y-2">
      <h4 id="team-lens-work-title" className="text-sm font-medium">
        Work in {label}
      </h4>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open tasks for {label}.</p>
      ) : (
        <ul className="grid gap-2">
          {shown.map((task) => (
            <li key={task.id} className="min-w-0 rounded-md border px-3 py-2">
              <p className="text-sm font-medium max-sm:break-words sm:truncate" title={task.title}>
                {task.title}
              </p>
              <p className="text-xs text-muted-foreground max-sm:break-words sm:truncate">
                {ownerOf(task, team) ?? "No owner"} · {statusLabel(task.status)} ·{" "}
                {capitalize(task.priority)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {tasks.length > SHOWN ? (
        <p className="text-xs text-muted-foreground">{tasks.length - SHOWN} more open tasks.</p>
      ) : null}
    </section>
  );
}

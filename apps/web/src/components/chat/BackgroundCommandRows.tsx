import type {
  EnvironmentId,
  OrchestrationV2PendingBackgroundTask,
  ThreadId,
} from "@t3tools/contracts";
import { DateTime } from "effect";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { orchestrationEnvironment } from "../../state/orchestration";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { AgentElapsed, formatCompactElapsedSeconds } from "./AgentElapsed";

// Same default as the server limit (BackgroundCommandLimit.ts). An extension is not sent yet.
const DEFAULT_LIMIT_MS = 30 * 60_000;

type CommandTask = Extract<OrchestrationV2PendingBackgroundTask, { kind: "command" }>;

export function commandTasks(
  tasks: ReadonlyArray<OrchestrationV2PendingBackgroundTask>,
): ReadonlyArray<CommandTask> {
  return tasks.filter((task): task is CommandTask => task.kind === "command");
}

/** Every live command, in full: kind, the whole command, and time against its limit. */
export function BackgroundCommandRows(props: {
  readonly tasks: ReadonlyArray<CommandTask>;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const stopCommand = useAtomCommand(orchestrationEnvironment.stopBackgroundCommand);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const stop = async (taskId: string) => {
    setStoppingId(taskId);
    const result = await stopCommand({
      environmentId: props.environmentId,
      input: { threadId: props.threadId, taskId },
    });
    setStoppingId(null);
    if (result._tag === "Failure") {
      toastManager.add({ type: "error", title: "Could not stop the command. Try again." });
    }
  };
  return (
    <ul className="mt-1 flex flex-col divide-y divide-border">
      {props.tasks.map((task) => {
        const startedAt = task.startedAt === undefined ? null : DateTime.formatIso(task.startedAt);
        const service = task.service === true;
        return (
          <li key={task.taskId} className="flex items-start gap-2 py-1.5 first:pt-0 last:pb-0">
            <span
              className={cn(
                "mt-0.5 shrink-0 rounded-sm px-1.5 text-xs font-medium",
                service ? "bg-input text-foreground" : "bg-state text-state-foreground",
              )}
            >
              {service ? "Service" : "Task"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="break-all font-mono text-xs text-foreground">
                {task.description ?? "Command"}
              </div>
              <div className="text-xs text-muted-foreground">
                {startedAt === null ? null : (
                  <>
                    <AgentElapsed agent={{ status: "running", startedAt, completedAt: null }} />
                    {service
                      ? " · no limit · runs again after an update"
                      : ` of ${formatCompactElapsedSeconds((task.timeoutMs ?? DEFAULT_LIMIT_MS) / 1000)}`}
                  </>
                )}
              </div>
            </div>
            <Button
              size="xs"
              variant="outline"
              disabled={stoppingId === task.taskId}
              onClick={() => void stop(task.taskId)}
            >
              {stoppingId === task.taskId ? "Stopping..." : "Stop"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

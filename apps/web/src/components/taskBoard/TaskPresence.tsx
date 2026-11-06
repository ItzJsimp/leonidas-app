import type { TaskBoardTask } from "@t3tools/contracts";
import { taskPresence, type TaskPresenceChat } from "@t3tools/shared/taskPresence";
import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";

import { Badge } from "~/components/ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useThreadShells } from "~/state/entities";
import { presenceKey } from "./taskLedger.logic";

type PresenceMap = ReadonlyMap<string, ReadonlyArray<TaskPresenceChat>>;

const NO_CHATS: ReadonlyArray<TaskPresenceChat> = [];
const PresenceContext = createContext<PresenceMap>(new Map());

/** Derives who works on each card from live thread shells (ADR-0090); the map keeps its identity until presence changes. */
export function TaskPresenceProvider(props: {
  readonly tasks: ReadonlyArray<Pick<TaskBoardTask, "id" | "threadIds" | "claimedAgent">>;
  readonly children: ReactNode;
}) {
  const shells = useThreadShells();
  const stable = useRef<{ key: string; map: PresenceMap }>({ key: "", map: new Map() });
  const map = useMemo(() => {
    const byId = new Map(shells.map((shell) => [shell.id as string, shell]));
    const next = new Map<string, ReadonlyArray<TaskPresenceChat>>();
    for (const task of props.tasks) {
      const chats = taskPresence(task, byId);
      if (chats.length > 0) next.set(task.id, chats);
    }
    const key = presenceKey(next);
    if (key === stable.current.key) return stable.current.map;
    stable.current = { key, map: next };
    return next;
  }, [shells, props.tasks]);
  return <PresenceContext value={map}>{props.children}</PresenceContext>;
}

const useTaskPresence = (taskId: string): ReadonlyArray<TaskPresenceChat> =>
  useContext(PresenceContext).get(taskId) ?? NO_CHATS;

/** One chip per chat working on the card now. Renders nothing when none is. */
export function PresenceChips({ taskId }: { readonly taskId: string }) {
  const chats = useTaskPresence(taskId);
  if (chats.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {chats.map((chat) => (
        <Tooltip key={chat.threadId}>
          <TooltipTrigger render={<span className="inline-flex min-w-0" />}>
            <Badge variant="outline" size="sm" className="max-w-44">
              <span className="truncate">{chat.title}</span>
              <span className="sr-only">
                {chat.status === "running" ? "working now" : "waiting for you"}
              </span>
            </Badge>
          </TooltipTrigger>
          <TooltipPopup>
            {chat.status === "running" ? "Working now" : "Waiting for you"}: {chat.title} (
            {chat.agent}, {chat.model})
          </TooltipPopup>
        </Tooltip>
      ))}
    </div>
  );
}

import { useAtomValue } from "@effect/atom-react";

import { liveTaskCommandsAtom } from "../../state/threads";

const SHOWN = 5;

/** The task commands that stop on restart, one line each with the chat that runs it. */
export function LiveCommandList() {
  const commands = useAtomValue(liveTaskCommandsAtom);
  if (commands.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1" aria-label="Commands that stop">
      {commands.slice(0, SHOWN).map((item) => (
        <li key={item.key} className="min-w-0 text-xs">
          <div className="break-all font-mono text-foreground">{item.command}</div>
          <div className="truncate text-muted-foreground">{item.threadTitle}</div>
        </li>
      ))}
      {commands.length > SHOWN ? (
        <li className="text-xs text-muted-foreground">and {commands.length - SHOWN} more</li>
      ) : null}
    </ul>
  );
}

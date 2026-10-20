import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, TaskBoardTaskStatus } from "@t3tools/contracts";
import { useState } from "react";

import { workspaceScopeInput } from "~/components/workspace/aiosWorkspace.logic";
import { activeWorkspaceId } from "~/components/workspace/aiosWorkspaceStore";
import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "~/components/ui/menu";
import { taskBoardApplyChangeSet } from "~/state/taskBoard";
import { useAtomCommand } from "~/state/use-atom-command";

import { bulkChanges, summarizeChangeSet, type BulkAction } from "./bulkSelect.logic";
import { statusLabel } from "./taskBoard.logic";
import { capBadge, type RailEntry } from "./tasksPage.logic";
import { failureText } from "./useTaskActions.logic";

const STATUSES: ReadonlyArray<TaskBoardTaskStatus> = [
  "todo",
  "in_progress",
  "review",
  "blocked",
  "done",
];

/** Acts on the checked rows: set status, park, retire or move, then offers one Undo. */
export function TaskBulkBar(props: {
  readonly environmentId: EnvironmentId | null;
  readonly member: string;
  readonly checked: ReadonlySet<string>;
  readonly entries: ReadonlyArray<RailEntry>;
  readonly onClear: () => void;
  readonly onChanged: () => void;
}) {
  const { environmentId, member, checked, onClear, onChanged } = props;
  const run = useAtomCommand(taskBoardApplyChangeSet, { reportFailure: false });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [ledgerId, setLedgerId] = useState<string | null>(null);

  const send = async (input: {
    mode: "apply" | "undo";
    action?: BulkAction;
    ledgerId?: string;
  }) => {
    if (environmentId === null) return;
    setBusy(true);
    const result = await run({
      environmentId,
      input: {
        ...workspaceScopeInput(activeWorkspaceId(environmentId)),
        actor: member,
        mode: input.mode,
        ...(input.action ? { changes: bulkChanges([...checked], input.action) } : {}),
        ...(input.ledgerId ? { ledgerId: input.ledgerId } : {}),
      },
    });
    setBusy(false);
    onChanged();
    if (result._tag !== "Success") {
      if (!isAtomCommandInterrupted(result)) {
        setNote(failureText(squashAtomCommandFailure(result), "The change failed. Try again."));
      }
      return;
    }
    if (input.mode === "undo") {
      const restored = result.value.rows.filter((row) => row.outcome === "restored").length;
      setNote(`Undone: ${restored} restored.`);
      setLedgerId(null);
      return;
    }
    const { changed, refused, firstReason } = summarizeChangeSet(result.value.rows);
    setNote(
      refused > 0
        ? `Changed ${changed}, refused ${refused}: ${firstReason}`
        : `Changed ${changed}.`,
    );
    setLedgerId(result.value.ledgerId);
    if (refused === 0) onClear();
  };

  const apply = (action: BulkAction) => void send({ mode: "apply", action });
  if (checked.size === 0 && note === null) return null;

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="flex flex-wrap items-center gap-2 border-b bg-accent/40 px-3 py-1.5 text-sm"
    >
      {checked.size > 0 ? (
        <>
          <span className="font-medium tabular-nums">{checked.size} selected</span>
          <Menu>
            <MenuTrigger render={<Button size="xs" variant="outline" disabled={busy} />}>
              Set status
            </MenuTrigger>
            <MenuPopup align="start">
              {STATUSES.map((status) => (
                <MenuItem key={status} onClick={() => apply({ kind: "status", status })}>
                  {statusLabel(status)}
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
          <Button
            size="xs"
            variant="outline"
            disabled={busy}
            onClick={() => apply({ kind: "status", status: "parked" })}
          >
            Park
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={busy}
            onClick={() => apply({ kind: "status", status: "retired" })}
          >
            Retire
          </Button>
          <Menu>
            <MenuTrigger render={<Button size="xs" variant="outline" disabled={busy} />}>
              Move to project
            </MenuTrigger>
            <MenuPopup align="start">
              {props.entries
                .filter((entry) => entry.slug !== "general")
                .map((entry) => {
                  const badge = capBadge(entry);
                  return (
                    <MenuItem
                      key={entry.slug}
                      disabled={badge?.tone === "full"}
                      onClick={() => apply({ kind: "project", slug: entry.slug })}
                    >
                      {entry.name}
                      {badge ? (
                        <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">
                          {badge.tone === "full" ? "full" : badge.label}
                        </span>
                      ) : null}
                    </MenuItem>
                  );
                })}
              <MenuSeparator />
              <MenuItem onClick={() => apply({ kind: "project", slug: null })}>
                No project (Inbox)
              </MenuItem>
            </MenuPopup>
          </Menu>
          <Button size="xs" variant="ghost" disabled={busy} onClick={onClear}>
            Clear
          </Button>
        </>
      ) : null}
      {note !== null ? (
        <span role="status" className="text-muted-foreground">
          {note}
        </span>
      ) : null}
      {ledgerId !== null ? (
        <Button
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={() => void send({ mode: "undo", ledgerId })}
        >
          Undo
        </Button>
      ) : null}
    </div>
  );
}

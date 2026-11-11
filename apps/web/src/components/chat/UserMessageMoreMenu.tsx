import { BookmarkPlusIcon, InboxIcon, MoreHorizontalIcon } from "lucide-react";
import { use, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import {
  type AtomCommandResult,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { type SavedItemCreateInput } from "@t3tools/contracts";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { useThreadShell } from "../../state/entities";
import { useProjectAiosWorkspace } from "../workspace/useProjectAiosWorkspace";
import { useCaptureDrop } from "../capture/useCaptureDrop";
import { useStableCallback } from "../../hooks/useStableCallback";
import { createDraftSaver } from "./savedDraft";
import { TimelineRowCtx } from "./TimelineRowContext";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";

function unwrap<A, E>(result: AtomCommandResult<A, E>): A {
  if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  return result.value;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Saves this user message as a prompt or adds it to the notepad. */
export function UserMessageMoreMenu({ text }: { readonly text: string }) {
  const ctx = use(TimelineRowCtx);
  const thread = useThreadShell(ctx.threadRef);
  const projectId = thread?.projectId ?? null;
  const workspace = useProjectAiosWorkspace(
    projectId ? { environmentId: ctx.activeThreadEnvironmentId, projectId } : null,
  );
  const canOperate = useAtomValue(
    serverEnvironment.createSavedItem.permissionAtom(ctx.activeThreadEnvironmentId),
  );
  const create = useAtomCommand(serverEnvironment.createSavedItem);
  const { drop, canDrop } = useCaptureDrop();
  const [busy, setBusy] = useState(false);
  const createForCurrentWorkspace = useStableCallback(async (input: SavedItemCreateInput) =>
    unwrap(
      await create({
        environmentId: ctx.activeThreadEnvironmentId,
        input: { ...input, ...workspace.scope },
      }),
    ),
  );
  const [saver] = useState(() =>
    createDraftSaver({ create: createForCurrentWorkspace, saveTask: async () => undefined }),
  );
  const promptDisabled =
    !canOperate ||
    !workspace.scopeReady ||
    workspace.environmentId !== ctx.activeThreadEnvironmentId ||
    !text.trim() ||
    busy;
  const notepadDisabled = !canDrop || !text.trim() || busy;

  const savePrompt = async () => {
    if (promptDisabled) return;
    setBusy(true);
    try {
      await saver.save(
        {
          key: `${ctx.threadRef?.threadId ?? "thread"}:${text}`,
          body: text,
          kind: "prompt",
          projectId,
        },
        () => true,
        () => {},
      );
      toastManager.add({ type: "success", title: "Saved as prompt" });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not save prompt",
        description: errorText(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const addToNotepad = async () => {
    if (notepadDisabled) return;
    setBusy(true);
    try {
      const result = await drop(text);
      if (!result.ok && result.error) {
        toastManager.add({ type: "error", title: "Could not save", description: result.error });
      }
    } catch (error) {
      toastManager.add({ type: "error", title: "Could not save", description: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={<Button type="button" size="xs" variant="ghost-muted" aria-label="More" />}
            />
          }
        >
          <MoreHorizontalIcon className="size-3" />
        </TooltipTrigger>
        <TooltipPopup side="top">More</TooltipPopup>
      </Tooltip>
      <MenuPopup side="top" align="end">
        <MenuItem disabled={promptDisabled} onClick={() => void savePrompt()}>
          <BookmarkPlusIcon />
          {busy ? "Saving…" : "Save as prompt"}
        </MenuItem>
        <MenuItem disabled={notepadDisabled} onClick={() => void addToNotepad()}>
          <InboxIcon />
          Add to notepad
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

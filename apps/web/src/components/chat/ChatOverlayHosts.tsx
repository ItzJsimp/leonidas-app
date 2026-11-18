import type { MessageId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import { useEffect } from "react";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";

/**
 * Open state for overlays the chat view hosts. It lives in atoms rather than
 * ChatView state so opening or closing one renders only its host, not the
 * whole chat chrome. Each entry carries the thread it was opened for; a host
 * shows only its own thread's entry and drops it when the thread changes.
 */
type ThreadOverlayAtom<T> = Atom.Writable<{ readonly threadKey: string; readonly value: T } | null>;

function makeThreadOverlayAtom<T>(label: string): ThreadOverlayAtom<T> {
  return Atom.make<{ readonly threadKey: string; readonly value: T } | null>(null).pipe(
    Atom.keepAlive,
    Atom.withLabel(`chat:${label}`),
  );
}

function closeThreadOverlay<T>(atom: ThreadOverlayAtom<T>): void {
  appAtomRegistry.set(atom, null);
}

function useThreadOverlay<T>(atom: ThreadOverlayAtom<T>, threadKey: string | null): T | null {
  const entry = useAtomValue(atom);
  useEffect(
    () => () => {
      if (appAtomRegistry.get(atom)?.threadKey === threadKey) closeThreadOverlay(atom);
    },
    [atom, threadKey],
  );
  return threadKey !== null && entry?.threadKey === threadKey ? entry.value : null;
}

interface PendingRevert {
  readonly turnCount: number;
  readonly messageId: MessageId;
}

const revertConfirmAtom = makeThreadOverlayAtom<PendingRevert>("revert-confirm");

export function openRevertConfirm(threadKey: string, pending: PendingRevert): void {
  appAtomRegistry.set(revertConfirmAtom, { threadKey, value: pending });
}

export function RevertConfirmHost(props: {
  readonly threadKey: string;
  readonly onConfirm: (turnCount: number, messageId: MessageId, restoreFiles: boolean) => void;
}) {
  const pending = useThreadOverlay(revertConfirmAtom, props.threadKey);
  const confirm = (restoreFiles: boolean) => {
    if (pending === null) return;
    closeThreadOverlay(revertConfirmAtom);
    props.onConfirm(pending.turnCount, pending.messageId, restoreFiles);
  };
  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) closeThreadOverlay(revertConfirmAtom);
      }}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Edit from here?</AlertDialogTitle>
          <AlertDialogDescription>
            Rewind chat to before this message. Your prompt and attachments return to the composer.
            “Revert files too” also undoes your own edits.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
          <Button variant="destructive-outline" onClick={() => confirm(true)}>
            Revert files too
          </Button>
          <Button onClick={() => confirm(false)}>Revert and keep changes</Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

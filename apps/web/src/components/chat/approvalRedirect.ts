/**
 * A message sent while approvals are pending redirects the agent. The approvals are declined
 * only after every earlier check accepted the send, so local commands and rejected drafts
 * leave them alone. Part of the turn submission module (slice 3, stage B).
 */
export interface ApprovalRedirectPorts<Approval extends { readonly requestId: string }> {
  /** True while the chat that sent is still the one on screen. */
  readonly isSendingChatActive: () => boolean;
  readonly pendingApprovals: () => ReadonlyArray<Approval>;
  readonly respondingRequestIds: () => ReadonlyArray<string>;
  /** Declines each approval. False when any decline failed. */
  readonly decline: (approvals: ReadonlyArray<Approval>) => Promise<boolean>;
  readonly livePrompt: () => string;
  readonly hasPendingAttachments: () => boolean;
  /** Ids of the live draft's attachments, or null when the composer is gone. */
  readonly liveAttachmentIds: () => ReadonlyArray<string> | null;
  /** The draft object itself: a changed identity means the user edited it. */
  readonly readDraft: () => unknown;
  /** Called when the send stops: free the send lock and the docked hero. */
  readonly release: () => void;
  readonly toast: (title: string) => void;
}

export interface ApprovalRedirectInput {
  /** Approvals the composer showed at send time. */
  readonly shownApprovalIds: ReadonlyArray<string>;
  readonly promptAtSend: string;
  readonly promptForSend: string;
  readonly attachmentIdsAtSend: ReadonlyArray<string>;
  /** A direct annotation writes its image into the draft as it sends. */
  readonly annotationImageId: string | undefined;
}

const sameIds = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

/** `proceed`: send the message. `stopped`: this module released the send. */
export async function redirectPendingApprovals<Approval extends { readonly requestId: string }>(
  ports: ApprovalRedirectPorts<Approval>,
  input: ApprovalRedirectInput,
): Promise<"proceed" | "stopped"> {
  // After navigating away during an upload, the shown approvals are another thread's.
  const approvalsToDecline = ports.isSendingChatActive()
    ? ports
        .pendingApprovals()
        .filter((approval) => input.shownApprovalIds.includes(approval.requestId))
    : [];
  if (approvalsToDecline.length === 0) return "proceed";

  const attachmentIdsBeforeAnnotation = input.attachmentIdsAtSend.filter(
    (id) => id !== input.annotationImageId,
  );
  // A draft edited since send, or a paste still landing in it, is no longer the message
  // the user sent. Anything differing beyond the annotation image is a real edit.
  const draftChangedSinceSend = () => {
    if (ports.hasPendingAttachments()) return true;
    const attachmentIds = ports.liveAttachmentIds() ?? input.attachmentIdsAtSend;
    const prompt = ports.livePrompt();
    const promptUnchanged = prompt === input.promptAtSend || prompt === input.promptForSend;
    const attachmentsUnchanged =
      sameIds(attachmentIds, input.attachmentIdsAtSend) ||
      (input.annotationImageId !== undefined &&
        sameIds(attachmentIds, attachmentIdsBeforeAnnotation));
    return !promptUnchanged || !attachmentsUnchanged;
  };

  const draftBeforeDecline = ports.readDraft();
  const changedBeforeDecline = draftChangedSinceSend();
  const pendingIdsBeforeDecline = ports.pendingApprovals().map((approval) => approval.requestId);
  const approvalResponding = approvalsToDecline.some((approval) =>
    ports.respondingRequestIds().includes(approval.requestId),
  );
  const declined =
    !changedBeforeDecline &&
    !approvalResponding &&
    (await ports.decline(approvalsToDecline).catch(() => false));
  const draftChanged =
    changedBeforeDecline || draftChangedSinceSend() || ports.readDraft() !== draftBeforeDecline;
  // An approval that arrived during the decline would block the redirect; keep the draft so
  // the next send declines it too.
  const approvalArrived = ports
    .pendingApprovals()
    .some((approval) => !pendingIdsBeforeDecline.includes(approval.requestId));
  if (declined && !draftChanged && !approvalArrived && ports.isSendingChatActive()) {
    return "proceed";
  }
  ports.release();
  if (draftChanged || approvalResponding || (declined && approvalArrived)) {
    ports.toast(
      draftChanged
        ? declined
          ? "Approval declined. Your message changed, so it wasn't sent."
          : "Your message changed, so it wasn't sent."
        : approvalResponding
          ? "An approval is already being answered, so your message wasn't sent."
          : "Another approval arrived, so your message wasn't sent.",
    );
  }
  return "stopped";
}

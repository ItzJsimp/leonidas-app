import {
  type ChatFileAttachment,
  isImageAttachment,
  isFileAttachment,
  isVideoAttachment,
  type ChatMessage,
  type ChatImageAttachment,
} from "../../types";
import { use, useMemo, useState, useCallback, memo, type ReactNode } from "react";
import { TimelineRowCtx, type TimelineRow, TimelineRowActivityCtx } from "./TimelineRowContext";
import {
  buildAttachmentVideoAsset,
  buildAttachmentVideoPreview,
  buildExpandedImagePreview,
} from "./ExpandedImagePreview";
import { useAssetUrlState, useAssetUrlRefresh, useAssetUrls } from "../../assets/assetUrls";
import { MediaVideoPlayer } from "../media/MediaVideoPlayer";
import { ModelSwitchRow } from "./V2LifecycleRow";
import {
  selectMessageImageResources,
  createMessageAttachmentPreviewProjector,
} from "../../session-logic";
import { filePreviewKind } from "@t3tools/shared/filePreview";
import { resolveUserMessagePresentation } from "@t3tools/client-runtime/user-message";
import {
  resolveUserMessageContext,
  asKnownContextRecord,
  selectedMessageContextFragment,
} from "~/lib/composerContextRecords";
import {
  collectComposerContextReferences,
  replaceComposerContextReferences,
} from "@t3tools/shared/composerContextReferences";
import {
  encodeComposerContextFragment,
  encodeComposerContextClipboardHtml,
  COMPOSER_CONTEXT_CLIPBOARD_MIME,
} from "@t3tools/shared/composerContextClipboard";
import { chatMarkdownClipboardPayload } from "../../markdown-clipboard";
import ChatMarkdown, { type ChatMarkdownContextReference } from "../ChatMarkdown";
import { UserMessageContextReferenceChip } from "./TimelineUserMessageContext";
import { Link } from "@tanstack/react-router";
import { InlineButton, Button } from "../ui/button";
import { MessageAuthorHeading, MESSAGE_HEADING_LEVEL } from "./LeoTimelineRowParts";
import { cn } from "~/lib/utils";
import {
  SNAP_SHOT_ATTACHMENT_FRAME_CLASS,
  SnapShotAttachmentDetails,
} from "./SnapShotAttachmentDetails";
import { InlineAudioPreview } from "../files/InlineAudioPreview";
import { PierreEntryIcon } from "./PierreEntryIcon";
import { EyeIcon, DownloadIcon, PencilIcon, Redo2Icon, Undo2Icon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { formatDayAwareTimestamp, formatChatTimestampTooltip } from "../../timestampFormat";
import { MessageCopyButton } from "./MessageCopyButton";
import { UserMessageMoreMenu } from "./UserMessageMoreMenu";
import {
  type KnownComposerContextRecord,
  type ComposerContextRecord,
  type MessageId,
  type ServerProviderSkill,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { useFindRevealRef } from "./markdownFindContext";
import { shouldCollapseUserMessage } from "./MessagesTimeline.logic";
import { useComposerSubagents } from "../subagents/useComposerSubagents";
import {
  type ReviewCommentContext,
  buildReviewCommentRenderablePatch,
  formatReviewCommentFence,
} from "../../reviewCommentContext";
import {
  getRenderablePatch,
  resolveFileDiffPath,
  resolveDiffThemeName,
} from "../../lib/diffRendering";
import { formatWorkspaceRelativePath } from "../../filePathDisplay";
import { SkillInlineText } from "./SkillInlineText";
import { DiffWorkerPoolProvider } from "../DiffWorkerPoolProvider";
import { FileDiff } from "@pierre/diffs/react";
import { PREFERRED_HIGHLIGHTER } from "../../lib/syntaxHighlighting";

function UserVideoAttachment({ file }: { readonly file: ChatFileAttachment }) {
  const ctx = use(TimelineRowCtx);
  const asset = useMemo(
    () =>
      file.downloadable === false
        ? null
        : buildAttachmentVideoAsset(ctx.activeThreadEnvironmentId, file),
    [ctx.activeThreadEnvironmentId, file.downloadable, file.id, file.mimeType, file.name],
  );
  const resource = asset?.resource ?? null;
  const assetUrl = useAssetUrlState(ctx.activeThreadEnvironmentId, resource);
  const refreshAssetUrl = useAssetUrlRefresh(ctx.activeThreadEnvironmentId, resource);
  const src = assetUrl._tag === "Success" ? assetUrl.url : (file.previewUrl ?? null);

  if (asset === null && src === null) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-border/80 bg-black px-2 py-3 text-center text-2xs text-white/70">
        {file.name}
      </div>
    );
  }

  return (
    <MediaVideoPlayer
      src={src}
      sourceFailed={
        file.previewUrl === undefined && resource !== null && assetUrl._tag === "Failure"
      }
      label={file.name}
      preload="visible"
      onOpen={() => {
        const preview = buildAttachmentVideoPreview(ctx.activeThreadEnvironmentId, file);
        if (preview) ctx.onImageExpand(preview);
      }}
      className="block aspect-[4/3] w-full"
      videoClassName="aspect-auto size-full rounded-lg border border-border/80"
      stateClassName="aspect-auto min-h-full rounded-lg border border-border/80 bg-black text-white"
      onRetry={asset ? refreshAssetUrl : undefined}
      actionsSource={asset ? { kind: "video", name: file.name, src, asset } : undefined}
    />
  );
}

export function UserTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "message" }> }) {
  const ctx = use(TimelineRowCtx);
  const item = row.projectedItem?.item;
  const modelSwitch = item?.type === "user_message" ? item.modelSwitch : undefined;
  return (
    <>
      {modelSwitch ? (
        <ModelSwitchRow providers={ctx.providerStatuses} modelSwitch={modelSwitch} />
      ) : null}
      <UserTimelineRowContent row={row} />
    </>
  );
}

function UserTimelineRowContent({ row }: { row: Extract<TimelineRow, { kind: "message" }> }) {
  const ctx = use(TimelineRowCtx);
  const { onImageExpand, onFileOpen } = ctx;
  const senderThreadId = row.message.senderThreadId;
  const resources = useMemo(
    () => selectMessageImageResources(row.message.attachments),
    [row.message.attachments],
  );
  const previewUrls = useAssetUrls(ctx.activeThreadEnvironmentId, resources);
  const [projectPreviews] = useState(createMessageAttachmentPreviewProjector);
  const messageWithPreviews = useMemo(() => {
    const urlsById = new Map(
      resources.flatMap((resource, index) => {
        const url = previewUrls[index];
        return url ? [[resource.attachmentId, url] as const] : [];
      }),
    );
    return projectPreviews(row.message, (attachment) => urlsById.get(attachment.id));
  }, [previewUrls, projectPreviews, resources, row.message]);
  // The attachment union has an open member, so guards (not literal type
  // comparisons) split it. Unknown types render as inert rows below the files.
  const userImages = useMemo(
    () => (messageWithPreviews.attachments ?? []).filter(isImageAttachment),
    [messageWithPreviews.attachments],
  );
  const userFiles = useMemo(
    () => (row.message.attachments ?? []).filter(isFileAttachment),
    [row.message.attachments],
  );
  const userVideos = userFiles.filter(isVideoAttachment);
  const userAudio = userFiles.filter(
    (file) => file.downloadable !== false && filePreviewKind(file) === "audio",
  );
  const otherUserFiles = userFiles.filter(
    (file) => !isVideoAttachment(file) && !userAudio.includes(file),
  );
  const unknownAttachments = (row.message.attachments ?? []).filter(
    (attachment) => !isImageAttachment(attachment) && !isFileAttachment(attachment),
  );
  const userMessage = resolveUserMessagePresentation(row.message);
  const resolvedContext = useMemo(() => resolveUserMessageContext(row.message), [row.message]);
  const previewImages = useMemo(
    () => userImages.filter((image) => image.name.startsWith("preview-annotation-")),
    [userImages],
  );
  const revertTurnCount = row.revertTurnCount;
  // A file with a chip in the prose needs no standalone row. Media is the exception: the
  // thumbnail is the only way to actually see it, so it shows whether or not it has a chip.
  const chippedAttachmentIds = new Set(
    collectComposerContextReferences(resolvedContext.text).flatMap((occurrence) => {
      const record = asKnownContextRecord(resolvedContext.recordsById.get(occurrence.contextId));
      return record?.kind === "file" || record?.kind === "image" ? [record.attachmentId] : [];
    }),
  );
  const regularImages = userImages.filter((image) => !image.name.startsWith("preview-annotation-"));
  const unchippedFiles = otherUserFiles.filter((file) => !chippedAttachmentIds.has(file.id));
  const annotationRecordIds = useMemo(
    () =>
      resolvedContext.records
        .filter((record) => record.kind === "preview-annotation")
        .map((record) => record.contextId),
    [resolvedContext.records],
  );
  const contextClipboardFragment =
    resolvedContext.records.length === 0
      ? null
      : encodeComposerContextFragment({
          version: 1,
          source: {
            environmentId: ctx.activeThreadEnvironmentId,
            ...(ctx.threadRef ? { threadId: ctx.threadRef.threadId } : {}),
            messageId: row.message.id,
          },
          records: resolvedContext.records,
        });
  // Chips inside the selection copy as their links (data-markdown-copy); the structured
  // fragment rides beside so a paste into a draft brings the payloads along. Only records
  // for chips that are actually inside the selection travel, so copying prose next to an
  // image never starts importing that image somewhere else.
  const onBodyCopyCapture = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (resolvedContext.records.length === 0 || !event.clipboardData) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const copiedMarkdown: string[] = [];
    for (let index = 0; index < selection.rangeCount; index += 1) {
      const container = document.createElement("div");
      container.appendChild(selection.getRangeAt(index).cloneContents());
      for (const element of container.querySelectorAll("[data-markdown-copy]")) {
        copiedMarkdown.push(element.getAttribute("data-markdown-copy") ?? "");
      }
    }
    const fragment = selectedMessageContextFragment({
      markdown: copiedMarkdown.join("\n"),
      records: resolvedContext.records,
      environmentId: ctx.activeThreadEnvironmentId,
      ...(ctx.threadRef ? { threadId: ctx.threadRef.threadId } : {}),
      messageId: row.message.id,
    });
    if (!fragment) return;
    // Claim the copy: without preventDefault the browser default overwrites the
    // custom MIME type. The default content must then be written back explicitly.
    const payload = chatMarkdownClipboardPayload(selection);
    event.preventDefault();
    event.clipboardData.setData("text/plain", payload?.text ?? selection.toString());
    if (payload) {
      event.clipboardData.setData(
        "text/html",
        encodeComposerContextClipboardHtml(payload.text, fragment, payload.html),
      );
    }
    event.clipboardData.setData(COMPOSER_CONTEXT_CLIPBOARD_MIME, fragment);
  };
  const renderContextReference = useCallback(
    (reference: ChatMarkdownContextReference) => {
      const record = asKnownContextRecord(resolvedContext.recordsById.get(reference.contextId));
      if (record?.kind === "file" && userAudio.some((file) => file.id === record.attachmentId))
        return null;
      // Structured annotations point at the image record, which in turn points at the persisted
      // attachment. Filename and order are compatibility fallbacks for legacy messages only.
      const annotationImage =
        record?.kind === "preview-annotation"
          ? resolvePreviewAnnotationImage({
              record,
              recordsById: resolvedContext.recordsById,
              userImages,
              previewImages,
              annotationRecordIds,
            })
          : null;
      const attachment =
        record?.kind === "image"
          ? (userImages.find((image) => image.id === record.attachmentId) ?? null)
          : record?.kind === "file"
            ? (userFiles.find((file) => file.id === record.attachmentId) ?? null)
            : null;
      return (
        <span data-thread-find-ignore>
          <UserMessageContextReferenceChip
            reference={reference}
            record={record}
            annotationImage={annotationImage}
            attachment={attachment}
            onExpandImage={(image) => {
              const preview = buildExpandedImagePreview(userImages, image.id);
              if (preview) onImageExpand(preview);
            }}
            onOpenFile={onFileOpen}
            onExpandVideo={(file) => {
              const preview = buildAttachmentVideoPreview(ctx.activeThreadEnvironmentId, file);
              if (preview) onImageExpand(preview);
            }}
          />
        </span>
      );
    },
    [
      resolvedContext.recordsById,
      userImages,
      userFiles,
      userAudio,
      previewImages,
      annotationRecordIds,
      onImageExpand,
      onFileOpen,
      ctx.activeThreadEnvironmentId,
    ],
  );

  return (
    <div className="group flex flex-col items-end gap-1">
      {userMessage.attribution === "automation" ? (
        <p
          className="me-1 text-2xs text-muted-foreground/70"
          data-user-message-attribution="automation"
        >
          {userMessage.scheduledTaskId ? (
            <Link
              to="/settings/scheduled-tasks"
              search={{
                environmentId: ctx.activeThreadEnvironmentId,
                taskId: userMessage.scheduledTaskId,
              }}
              className="rounded-sm hover:text-muted-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              Sent by automation
            </Link>
          ) : (
            "Sent by automation"
          )}
        </p>
      ) : userMessage.attribution === "t3code" ? (
        <p
          className="me-1 text-2xs text-muted-foreground/70"
          data-user-message-attribution="t3code"
        >
          Sent by Leonidas
        </p>
      ) : userMessage.attribution === "agent" ? (
        <p className="me-1 text-2xs text-muted-foreground/70" data-user-message-attribution="agent">
          {senderThreadId ? (
            <InlineButton
              onClick={() => ctx.onOpenThread(senderThreadId)}
              tone="muted"
              aria-label="Open the chat that sent this"
            >
              Sent by another AI
            </InlineButton>
          ) : (
            "Sent by another AI"
          )}
        </p>
      ) : null}
      {row.message.inputIntent && row.message.inputIntent !== "turn_start" ? (
        <UserMessageIntentMarker intent={row.message.inputIntent} />
      ) : null}
      <div className="relative max-w-[80%] rounded-2xl bg-message p-3 text-message-foreground [&_[data-slot=context-chip]]:[--context-chip-ink:var(--context-chip-message,var(--context-chip-accent))]">
        <MessageAuthorHeading>You</MessageAuthorHeading>
        {(regularImages.length > 0 || userVideos.length > 0) && (
          <div className="mb-2 grid max-w-[210px] grid-cols-2 gap-2">
            {regularImages.map((image) => (
              <div
                key={image.id}
                className={cn(
                  "bg-background/70",
                  image.source?.kind === "snap-shot" && image.previewUrl
                    ? cn(SNAP_SHOT_ATTACHMENT_FRAME_CLASS, "col-span-2")
                    : "aspect-[4/3] overflow-hidden rounded-lg border border-border/80",
                )}
              >
                {image.previewUrl ? (
                  <button
                    type="button"
                    className="block h-full w-full cursor-zoom-in"
                    aria-label={`Preview ${image.name}`}
                    onClick={() => {
                      const preview = buildExpandedImagePreview(regularImages, image.id);
                      if (!preview) return;
                      ctx.onImageExpand(preview);
                    }}
                  >
                    <img
                      src={image.previewUrl}
                      alt={image.name}
                      className="block size-full object-cover"
                    />
                  </button>
                ) : (
                  <div className="flex min-h-[72px] items-center justify-center px-2 py-3 text-center text-2xs text-muted-foreground/70">
                    {image.name}
                  </div>
                )}
                {image.previewUrl && image.source?.kind === "snap-shot" ? (
                  <SnapShotAttachmentDetails source={image.source} />
                ) : null}
              </div>
            ))}
            {userVideos.map((file) => (
              <UserVideoAttachment key={file.id} file={file} />
            ))}
          </div>
        )}
        {userAudio.length > 0 ? (
          <div className="mb-2 flex max-w-full flex-col gap-1">
            {userAudio.map((file) => (
              <InlineAudioPreview
                key={file.id}
                name={file.name}
                environmentId={ctx.activeThreadEnvironmentId}
                resource={{
                  _tag: "attachment",
                  attachmentId: file.id,
                  fileName: file.name,
                  mimeType: file.mimeType,
                  disposition: "inline",
                }}
                onOpen={() => ctx.onFileOpen(file)}
              />
            ))}
          </div>
        ) : null}
        {unchippedFiles.length > 0 || unknownAttachments.length > 0 ? (
          <div className="mb-2 flex flex-col gap-1">
            {unchippedFiles.map((file) => {
              const fileIdentity = (
                <>
                  <PierreEntryIcon pathValue={file.name} kind="file" theme={ctx.resolvedTheme} />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                </>
              );
              if (file.downloadable !== false) {
                return (
                  <div key={file.id} className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Preview ${file.name}`}
                      onClick={() => ctx.onFileOpen(file)}
                      className="focus-visible:ring-ring/70 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md py-1 text-left text-sm hover:underline focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none"
                    >
                      {fileIdentity}
                      <EyeIcon className="size-4 shrink-0" />
                    </button>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size="icon-xs"
                            variant="ghost-muted"
                            aria-label={`Download ${file.name}`}
                            onClick={() => ctx.onFileDownload(file)}
                          />
                        }
                      >
                        <DownloadIcon />
                      </TooltipTrigger>
                      <TooltipPopup side="top">Download {file.name}</TooltipPopup>
                    </Tooltip>
                  </div>
                );
              }

              return (
                <div key={file.id} className="flex min-w-0 items-center gap-2 py-1 text-sm">
                  {fileIdentity}
                </div>
              );
            })}
            {unknownAttachments.map((attachment) => (
              <div key={attachment.id} className="flex min-w-0 items-center gap-2 py-1 text-sm">
                <PierreEntryIcon
                  pathValue={attachment.name}
                  kind="file"
                  theme={ctx.resolvedTheme}
                />
                <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div onCopyCapture={onBodyCopyCapture}>
          <CollapsibleUserMessageBody
            text={resolvedContext.text}
            renderContextReference={renderContextReference}
            skills={ctx.skills}
            markdownCwd={ctx.markdownCwd}
          />
        </div>
      </div>
      {row.projectedItem &&
      row.projectedItem.item.status !== "completed" &&
      row.projectedItem.item.status !== "pending" &&
      row.projectedItem.item.status !== "waiting" ? (
        <div className="me-1 flex items-center gap-1.5">
          <span className="rounded-full border border-destructive/25 bg-destructive/8 px-1.5 py-0.5 text-3xs font-medium text-destructive">
            {row.projectedItem.item.status}
          </span>
        </div>
      ) : null}
      <div className="flex w-full max-w-[80%] items-center justify-end pe-1 text-xs tabular-nums opacity-0 transition-opacity duration-200 pointer-coarse:opacity-100 focus-within:opacity-100 group-hover:opacity-100">
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip>
            <TooltipTrigger render={<p className="text-muted-foreground text-xs tabular-nums" />}>
              {formatDayAwareTimestamp(row.message.createdAt, ctx.timestampFormat)}
            </TooltipTrigger>
            <TooltipPopup>
              {formatChatTimestampTooltip(row.message.createdAt, ctx.timestampFormat)}
            </TooltipPopup>
          </Tooltip>
          <div className="flex items-center gap-0.5">
            {typeof revertTurnCount === "number" && (
              <RevertUserMessageButton turnCount={revertTurnCount} messageId={row.message.id} />
            )}
            {resolvedContext.text && (
              <MessageCopyButton
                // Structured paste needs the canonical links to retain their positions.
                text={
                  contextClipboardFragment
                    ? resolvedContext.text
                    : replaceComposerContextReferences(
                        resolvedContext.text,
                        (reference) => reference.label,
                      )
                }
                {...(contextClipboardFragment
                  ? {
                      extraFlavors: { [COMPOSER_CONTEXT_CLIPBOARD_MIME]: contextClipboardFragment },
                    }
                  : {})}
                variant="ghost"
              />
            )}
            {resolvedContext.text && <UserMessageMoreMenu text={resolvedContext.text} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function UserMessageIntentMarker({
  intent,
}: {
  readonly intent: NonNullable<ChatMessage["inputIntent"]>;
}) {
  const presentation =
    intent === "queued_turn"
      ? {
          label: "Waiting",
          icon: null,
        }
      : intent === "promoted_queued_to_steer"
        ? {
            label: "Sent now",
            icon: Redo2Icon,
          }
        : {
            label: "Sent now",
            icon: Redo2Icon,
          };
  const IntentIcon = presentation.icon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className="me-1 flex items-center justify-end gap-1 text-xs leading-none text-muted-foreground"
            data-user-message-intent={intent}
          />
        }
      >
        {IntentIcon ? <IntentIcon aria-hidden="true" className="size-3" /> : null}
        {presentation.label}
      </TooltipTrigger>
      <TooltipPopup side="top">
        {intent === "queued_turn"
          ? "This message waited until the AI stopped"
          : intent === "promoted_queued_to_steer"
            ? "This message waited first. Then you sent it now, while the AI worked."
            : "You sent this message while the AI worked"}
      </TooltipPopup>
    </Tooltip>
  );
}

export function resolvePreviewAnnotationImage(input: {
  record: Extract<KnownComposerContextRecord, { kind: "preview-annotation" }>;
  recordsById: ReadonlyMap<string, ComposerContextRecord>;
  userImages: ReadonlyArray<ChatImageAttachment>;
  previewImages: ReadonlyArray<ChatImageAttachment>;
  annotationRecordIds: ReadonlyArray<string>;
}): ChatImageAttachment | null {
  const screenshotRecord = input.record.screenshotContextId
    ? asKnownContextRecord(input.recordsById.get(input.record.screenshotContextId))
    : undefined;
  return (
    (screenshotRecord?.kind === "image"
      ? input.userImages.find((image) => image.id === screenshotRecord.attachmentId)
      : undefined) ??
    input.previewImages.find(
      (image) => image.name === `preview-annotation-${input.record.annotationId}.png`,
    ) ??
    input.previewImages[input.annotationRecordIds.indexOf(input.record.contextId)] ??
    null
  );
}

function RevertUserMessageButton({
  turnCount,
  messageId,
}: {
  turnCount: number;
  messageId: MessageId;
}) {
  const ctx = use(TimelineRowCtx);
  const activity = use(TimelineRowActivityCtx);
  const [dialogOpen, setDialogOpen] = useState(false);
  const disabled = activity.isRevertingCheckpoint || activity.isWorking;
  const rewind = (restoreFiles: boolean) => {
    setDialogOpen(false);
    ctx.onRevertToTurnCount(turnCount, messageId, restoreFiles);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={disabled}
              onClick={() => rewind(false)}
              aria-label="Edit and resend"
            />
          }
        >
          <PencilIcon className="size-3" />
        </TooltipTrigger>
        <TooltipPopup side="top">
          <div className="font-medium">Edit and resend</div>
          <div className="text-muted-foreground">
            Your message returns to the box. This removes it and the replies after it. Your files
            stay as they are.
          </div>
        </TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={disabled}
              onClick={() => setDialogOpen(true)}
              aria-label="Rewind to here"
            />
          }
        >
          <Undo2Icon className="size-3" />
        </TooltipTrigger>
        <TooltipPopup side="top">Rewind to here</TooltipPopup>
      </Tooltip>
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Rewind to here?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes this message and all the replies after it. Your message returns to the
              box so you can edit it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </AlertDialogClose>
            <Button size="sm" variant="outline" onClick={() => rewind(false)}>
              Chat only
            </Button>
            <Button size="sm" variant="destructive" onClick={() => rewind(true)}>
              Go back, files and chat
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}

const COLLAPSED_USER_MESSAGE_FADE_HEIGHT_REM = 1.75;

const COLLAPSED_USER_MESSAGE_FADE_MASK = `linear-gradient(to bottom, black calc(100% - ${COLLAPSED_USER_MESSAGE_FADE_HEIGHT_REM}rem), transparent)`;

const CollapsibleUserMessageBody = memo(function CollapsibleUserMessageBody(props: {
  text: string;
  renderContextReference: (reference: ChatMarkdownContextReference) => ReactNode;
  skills: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">>;
  markdownCwd: string | undefined;
  footer?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  // Find opens the body only when it selects a match in the clipped part.
  const revealForFind = useCallback(() => setExpanded(true), []);
  const findRevealRef = useFindRevealRef(revealForFind);
  const hasVisibleBody = props.text.trim().length > 0;
  const canCollapse = hasVisibleBody && shouldCollapseUserMessage(props.text);
  const isCollapsed = canCollapse && !expanded;
  const showCollapseControl = canCollapse;

  return (
    <div>
      {hasVisibleBody ? (
        <div
          ref={findRevealRef}
          className={cn("relative", isCollapsed && "max-h-44 overflow-hidden")}
          data-user-message-body="true"
          data-thread-find-text="true"
          data-thread-find-fold={isCollapsed ? "" : undefined}
          data-user-message-collapsed={isCollapsed ? "true" : "false"}
          data-user-message-collapsible={canCollapse ? "true" : "false"}
          data-user-message-fade={isCollapsed ? "true" : "false"}
          style={
            isCollapsed
              ? {
                  WebkitMaskImage: COLLAPSED_USER_MESSAGE_FADE_MASK,
                  maskImage: COLLAPSED_USER_MESSAGE_FADE_MASK,
                }
              : undefined
          }
        >
          <UserMessageBody
            text={props.text}
            renderContextReference={props.renderContextReference}
            skills={props.skills}
            markdownCwd={props.markdownCwd}
          />
        </div>
      ) : null}
      {showCollapseControl || props.footer ? (
        <div
          className={cn(
            "mt-1.5 flex items-center gap-2",
            showCollapseControl && props.footer ? "justify-between" : "justify-end",
          )}
          data-user-message-footer="true"
        >
          {showCollapseControl ? (
            <Button
              type="button"
              size="xs"
              variant="ghost-muted"
              aria-expanded={expanded}
              data-scroll-anchor-ignore
              onClick={() => setExpanded((value) => !value)}
              className="-ml-1"
            >
              {expanded ? "Show less" : "Show the whole message"}
            </Button>
          ) : null}
          {props.footer ? (
            <div className="ml-auto flex items-center gap-2">{props.footer}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

const UserMessageBody = memo(function UserMessageBody(props: {
  text: string;
  renderContextReference?: (reference: ChatMarkdownContextReference) => ReactNode;
  skills: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">>;
  markdownCwd: string | undefined;
}) {
  const ctx = use(TimelineRowCtx);
  if (props.text.length === 0) {
    return null;
  }
  // Only a message with an @ asks the catalog for subagent names.
  return props.text.includes("@") ? (
    <UserMessageMarkdownWithSubagents {...props} threadRef={ctx.threadRef} />
  ) : (
    <UserMessageMarkdown {...props} threadRef={ctx.threadRef} subagentNames={NO_SUBAGENT_NAMES} />
  );
});

function UserMessageMarkdownWithSubagents(
  props: Omit<React.ComponentProps<typeof UserMessageMarkdown>, "subagentNames">,
) {
  const options = useComposerSubagents(props.threadRef);
  const names = useMemo(() => options.map((option) => option.name), [options]);
  return <UserMessageMarkdown {...props} subagentNames={names} />;
}

const NO_SUBAGENT_NAMES: ReadonlyArray<string> = [];

function UserMessageMarkdown(props: {
  text: string;
  renderContextReference?: (reference: ChatMarkdownContextReference) => ReactNode;
  skills: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">>;
  markdownCwd: string | undefined;
  threadRef: ScopedThreadRef | null;
  subagentNames: ReadonlyArray<string>;
}) {
  return (
    <ChatMarkdown
      text={props.text}
      cwd={props.markdownCwd}
      threadRef={props.threadRef ?? undefined}
      skills={props.skills}
      subagents={props.subagentNames}
      className="text-foreground"
      lineBreaks
      parseRawHtml={false}
      renderContextReference={props.renderContextReference}
      headingLevelOffset={MESSAGE_HEADING_LEVEL}
    />
  );
}

export function UserMessageReviewCommentCard({ comment }: { comment: ReviewCommentContext }) {
  const ctx = use(TimelineRowCtx);
  const fenceLanguage = comment.fenceLanguage ?? "diff";
  const renderablePatch = getRenderablePatch(
    buildReviewCommentRenderablePatch(comment),
    `review-comment:${comment.id}`,
  );

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-background/70 p-3">
      <div className="space-y-1">
        <div className="text-xs font-medium text-foreground">
          {formatWorkspaceRelativePath(comment.filePath, ctx.workspaceRoot)}
        </div>
        <div className="text-2xs text-muted-foreground">
          {comment.sectionTitle} · {comment.rangeLabel}
        </div>
      </div>
      {comment.text.length > 0 && (
        <div className="whitespace-pre-wrap wrap-break-word text-sm">
          <SkillInlineText text={comment.text} skills={ctx.skills} />
        </div>
      )}
      {fenceLanguage !== "diff" && comment.diff.trim().length > 0 && (
        <ChatMarkdown
          text={formatReviewCommentFence(fenceLanguage, comment.diff)}
          cwd={ctx.markdownCwd}
          threadRef={ctx.threadRef ?? undefined}
          skills={ctx.skills}
          className="text-foreground"
        />
      )}
      {renderablePatch?.kind === "files" && (
        <DiffWorkerPoolProvider>
          {renderablePatch.files.map((fileDiff) => (
            <FileDiff
              key={resolveFileDiffPath(fileDiff)}
              fileDiff={fileDiff}
              options={{
                collapsed: false,
                diffStyle: "unified",
                theme: resolveDiffThemeName(ctx.resolvedTheme),
                preferredHighlighter: PREFERRED_HIGHLIGHTER,
              }}
            />
          ))}
        </DiffWorkerPoolProvider>
      )}
      {renderablePatch?.kind === "raw" && (
        <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-xs">
          {renderablePatch.text}
        </pre>
      )}
    </div>
  );
}

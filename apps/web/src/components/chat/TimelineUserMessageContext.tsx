import {
  type KnownComposerContextRecord,
  type EnvironmentId,
  COMPOSER_CONTEXT_KINDS,
  type ComposerContextId,
} from "@t3tools/contracts";
import { use, type ReactNode } from "react";
import { TimelineRowCtx } from "./TimelineRowContext";
import { useSubagentMention } from "../subagents/useSubagentMention";
import { BotIcon, PaintbrushIcon, MousePointerClickIcon, MessageCircleIcon } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { ContextChip, ContextChipLabel, type ContextChipKind } from "../ContextChip";
import { useRightPanelStore } from "~/rightPanelStore";
import { WorkspaceEntryIcon, WorkspaceEntryTooltip } from "./WorkspaceEntryIcon";
import {
  ContextChipShell,
  PullRequestChip,
  UnresolvedChip,
  ImageChipButton,
  FileChip,
  ContextChipPopover as UserMessageContextPopover,
  PULL_REQUEST_CHIP_KINDS,
} from "../contextChipParts";
import {
  reviewCommentContextLabel,
  pullRequestContextKindLabel,
  isPullRequestSummaryContext,
  pullRequestContextDisplayState,
} from "~/lib/composerContextRecords";
import {
  type ChatImageAttachment,
  type ChatFileAttachment,
  isImageAttachment,
  isVideoAttachment,
} from "../../types";
import { buildExpandedImagePreview } from "./ExpandedImagePreview";
import { ReadOnlySourcePreview } from "../files/AttachmentFilePreview";
import { type ChatMarkdownContextReference } from "../ChatMarkdown";
import { createContextPresentationRegistry } from "../contextPresentationRegistry";
import { SkillChipIcon } from "./SkillInlineText";
import { ThreadContextChip } from "../ThreadContextChip";
import { formatAttachmentSize } from "@t3tools/client-runtime/state/attachments";
import { isSvgAttachment } from "@t3tools/shared/image";
import { TerminalContextInlineChip } from "./TerminalContextInlineChip";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { UserMessageReviewCommentCard } from "./LeoTimelineUserMessageRow";
import { formatComposerContextReference } from "@t3tools/shared/composerContextReferences";

// ---------------------------------------------------------------------------
// Leaf components
// ---------------------------------------------------------------------------

function UserMessageMentionChip(props: {
  record: Extract<KnownComposerContextRecord, { kind: "mention" }>;
  copyMarkdown: string;
}) {
  const ctx = use(TimelineRowCtx);
  const subagent = useSubagentMention(props.record.path);
  if (subagent) {
    return (
      <UserMessageContextChip
        icon={<BotIcon aria-hidden />}
        label={subagent.name}
        kindLabel="Helper"
        tooltip={subagent.description ?? `@${subagent.name}`}
        copyMarkdown={props.copyMarkdown}
        kind="skill"
      />
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ContextChip
            kind="mention"
            render={<button type="button" />}
            aria-label={`Preview ${props.record.path}`}
            data-markdown-copy={props.copyMarkdown}
            onClick={() => {
              if (ctx.threadRef)
                useRightPanelStore.getState().openFile(ctx.threadRef, props.record.path);
            }}
          >
            <WorkspaceEntryIcon
              path={props.record.path}
              environmentId={ctx.activeThreadEnvironmentId}
              cwd={ctx.workspaceRoot}
              theme={ctx.resolvedTheme}
            />
            <ContextChipLabel>{props.record.label}</ContextChipLabel>
          </ContextChip>
        }
      />
      <TooltipPopup>
        <WorkspaceEntryTooltip
          path={props.record.path}
          environmentId={ctx.activeThreadEnvironmentId}
          cwd={ctx.workspaceRoot}
        />
      </TooltipPopup>
    </Tooltip>
  );
}

function UserMessageContextChip(props: {
  icon: ReactNode;
  label: string;
  kindLabel?: string;
  copyMarkdown: string;
  tooltip?: string;
  kind: ContextChipKind;
}) {
  return (
    <ContextChipShell
      kind={props.kind}
      icon={props.icon}
      label={props.label}
      aria-label={props.kindLabel ? `${props.kindLabel}, ${props.label}` : undefined}
      data-markdown-copy={props.copyMarkdown}
      tooltip={props.tooltip}
    />
  );
}

function UserMessagePullRequestContextChip(props: {
  record: Extract<KnownComposerContextRecord, { kind: "review-comment" }>;
  copyMarkdown: string;
  kind: ContextChipKind;
}) {
  const { activeThreadEnvironmentId, openPullRequest } = use(TimelineRowCtx);
  const metadata = props.record.pullRequest;
  if (metadata === undefined) return null;
  return (
    <PullRequestChip
      metadata={metadata}
      environmentId={activeThreadEnvironmentId}
      label={reviewCommentContextLabel(props.record)}
      kindLabel={pullRequestContextKindLabel(props.record)}
      kind={props.kind}
      copyMarkdown={props.copyMarkdown}
      onOpen={openPullRequest}
    />
  );
}

function UserMessagePreviewAnnotationDetails(props: {
  record: Extract<KnownComposerContextRecord, { kind: "preview-annotation" }>;
  image: ChatImageAttachment | null;
}) {
  const ctx = use(TimelineRowCtx);
  const visibleElements = props.record.elements ?? [];
  return (
    <div className="max-w-full overflow-hidden rounded-lg border border-border/70 bg-background/70">
      {props.image?.previewUrl ? (
        <button
          type="button"
          className="block max-h-64 w-full cursor-zoom-in overflow-hidden border-b border-border/70 bg-muted"
          aria-label={`Preview ${props.image.name}`}
          onClick={() => {
            if (!props.image) return;
            const preview = buildExpandedImagePreview([props.image], props.image.id);
            if (preview) ctx.onImageExpand(preview);
          }}
        >
          <img
            src={props.image.previewUrl}
            alt="Annotated preview crop"
            className="max-h-64 w-full object-contain"
          />
        </button>
      ) : (
        <div className="border-b border-border/70 bg-muted/40 px-3 py-2 text-secondary-label text-xs">
          No screenshot to show
        </div>
      )}
      <div className="min-w-0 px-3 py-2.5">
        <div className="text-message-foreground text-xs font-medium">
          {props.record.pageTitle?.trim() || props.record.pageUrl || "Note on the preview"}
        </div>
        {props.record.comment ? (
          <div className="mt-1 whitespace-pre-wrap wrap-break-word text-sm">
            {props.record.comment}
          </div>
        ) : null}
        <div className="mt-1 flex items-center gap-2 text-secondary-label text-3xs">
          {props.record.targetSummary ? (
            <span className="truncate">{props.record.targetSummary}</span>
          ) : null}
          {(props.record.styleChanges?.length ?? 0) > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1">
              <PaintbrushIcon className="size-3" />
              {props.record.styleChanges?.length ?? 0}
            </span>
          ) : null}
        </div>
        {visibleElements.length > 0 ? (
          <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
            {visibleElements.map((element) => {
              const source = element.source;
              const sourceLabel = source?.fileName
                ? `${source.fileName}${source.lineNumber === null ? "" : `:${source.lineNumber}`}`
                : null;
              return (
                <div
                  key={`${element.selector}\u0000${element.tagName}\u0000${sourceLabel ?? ""}\u0000${element.htmlPreview}`}
                  className="min-w-0"
                >
                  <div className="flex min-w-0 items-center gap-2 text-xs">
                    <code className="truncate text-message-foreground">
                      {element.selector || `<${element.tagName}>`}
                    </code>
                    {sourceLabel ? (
                      <span className="ml-auto shrink-0 text-secondary-label">{sourceLabel}</span>
                    ) : null}
                  </div>
                  {element.htmlPreview?.trim() ? (
                    <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-muted/60 px-2 py-1.5 text-3xs leading-relaxed">
                      {element.htmlPreview.trim()}
                    </pre>
                  ) : null}
                </div>
              );
            })}
            {(props.record.elements?.length ?? 0) > visibleElements.length ? (
              <div className="text-secondary-label text-3xs">
                {(props.record.elements?.length ?? 0) - visibleElements.length} more selected
                elements
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UserMessageElementDetails({
  record,
}: {
  record: Extract<KnownComposerContextRecord, { kind: "element" }>;
}) {
  const sourceLabel = record.source?.fileName
    ? `${record.source.fileName}${record.source.lineNumber === null ? "" : `:${record.source.lineNumber}`}`
    : null;
  return (
    <div className="max-w-full overflow-hidden rounded-lg border border-border/70 bg-background/70">
      <div className="border-b border-border/70 px-3 py-2.5">
        <div className="truncate text-message-foreground text-xs font-medium">
          {record.pageTitle?.trim() || record.pageUrl}
        </div>
        <div className="mt-0.5 truncate text-secondary-label text-3xs">{record.pageUrl}</div>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <code className="truncate text-message-foreground">
            {record.selector || `<${record.tagName}>`}
          </code>
          {sourceLabel ? (
            <span className="ml-auto shrink-0 text-secondary-label">{sourceLabel}</span>
          ) : null}
        </div>
        {record.htmlPreview?.trim() ? (
          <div className="flex h-40 flex-col overflow-hidden rounded border border-border">
            <ReadOnlySourcePreview name="element.html" text={record.htmlPreview} />
          </div>
        ) : null}
        {record.styles?.trim() ? (
          <div className="flex h-32 flex-col overflow-hidden rounded border border-border">
            <ReadOnlySourcePreview name="styles.css" text={record.styles} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface UserMessageContextRenderContext {
  environmentId: EnvironmentId;
  reference: ChatMarkdownContextReference;
  annotationImage: ChatImageAttachment | null;
  attachment: ChatImageAttachment | ChatFileAttachment | null;
  resolvedTheme: "light" | "dark";
  copyMarkdown: string;
  onExpandImage: (image: ChatImageAttachment) => void;
  onExpandVideo: (file: ChatFileAttachment) => void;
  onOpenFile: (file: ChatFileAttachment) => void;
}

function UnavailableUserMessageContextChip(props: UserMessageContextRenderContext) {
  return (
    <UnresolvedChip
      label={props.reference.label}
      copyMarkdown={props.copyMarkdown}
      tooltip="This item is gone. Add it again if you need it."
    />
  );
}

const userMessageContextPresentationRegistry = createContextPresentationRegistry<
  KnownComposerContextRecord,
  UserMessageContextRenderContext,
  ReactNode
>({
  requiredKinds: COMPOSER_CONTEXT_KINDS,
  handlers: [
    {
      kind: "mention",
      canRender: (record) => record.kind === "mention",
      render: (record, context) =>
        record.kind === "mention" ? (
          <UserMessageMentionChip record={record} copyMarkdown={context.copyMarkdown} />
        ) : (
          <UnavailableUserMessageContextChip {...context} />
        ),
    },
    {
      kind: "skill",
      canRender: (record) => record.kind === "skill",
      render: (record, context) =>
        record.kind === "skill" ? (
          <UserMessageContextChip
            icon={<SkillChipIcon />}
            label={record.label || record.name}
            kindLabel="Skill"
            tooltip={`$${record.name}`}
            copyMarkdown={context.copyMarkdown}
            kind="skill"
          />
        ) : (
          <UnavailableUserMessageContextChip {...context} />
        ),
    },
    {
      kind: "thread",
      canRender: (record) => record.kind === "thread",
      render: (record, context) =>
        record.kind === "thread" ? (
          <ThreadContextChip record={record} copyMarkdown={context.copyMarkdown} />
        ) : (
          <UnavailableUserMessageContextChip {...context} />
        ),
    },
    {
      kind: "image",
      canRender: (record, context) =>
        record.kind === "image" &&
        context.attachment !== null &&
        isImageAttachment(context.attachment),
      render: (record, context) => {
        if (
          record.kind !== "image" ||
          context.attachment === null ||
          !isImageAttachment(context.attachment)
        ) {
          return <UnavailableUserMessageContextChip {...context} />;
        }
        const attachment = context.attachment;
        return (
          <ImageChipButton
            name={record.name}
            previewUrl={attachment.previewUrl}
            size={formatAttachmentSize(record.sizeBytes)}
            data-markdown-copy={context.copyMarkdown}
            onClick={() => context.onExpandImage(attachment)}
          />
        );
      },
    },
    {
      kind: "file",
      // A file chip names its attachment by id, so it renders whatever came back under that id.
      // `isFileAttachment` excludes pictures, which a legacy `file` attachment may still be.
      canRender: (record, context) =>
        record.kind === "file" && context.attachment !== null && context.attachment.type === "file",
      render: (record, context) => {
        if (
          record.kind !== "file" ||
          context.attachment === null ||
          context.attachment.type !== "file"
        ) {
          return <UnavailableUserMessageContextChip {...context} />;
        }
        const attachment = context.attachment;
        const isVideo = isVideoAttachment(attachment);
        const disabled =
          attachment.downloadable === false && (!isVideo || attachment.previewUrl === undefined);
        const size = formatAttachmentSize(record.sizeBytes);
        return (
          <FileChip
            name={record.name}
            svgPreview={
              isSvgAttachment(attachment)
                ? { environmentId: context.environmentId, attachmentId: attachment.id }
                : undefined
            }
            size={size}
            isVideo={isVideo}
            theme={context.resolvedTheme}
            disabled={disabled}
            accessibleLabel={`${isVideo ? "Video" : "File"} attachment, ${record.name}, ${size}`}
            copyMarkdown={context.copyMarkdown}
            onOpen={() =>
              isVideo ? context.onExpandVideo(attachment) : context.onOpenFile(attachment)
            }
            tooltip={`${record.name}\n${size}`}
          />
        );
      },
    },
    {
      kind: "terminal",
      canRender: (record) => record.kind === "terminal",
      render: (record, context, definition) =>
        record.kind === "terminal" ? (
          <span data-markdown-copy={context.copyMarkdown}>
            <TerminalContextInlineChip
              label={record.label}
              terminalLabel={record.terminalLabel}
              lineStart={record.lineStart}
              lineEnd={record.lineEnd}
              text={record.text}
              detailsMode={definition.capabilities.details}
            />
          </span>
        ) : (
          <UnavailableUserMessageContextChip {...context} />
        ),
    },
    {
      kind: "element",
      canRender: (record) => record.kind === "element",
      render: (record, context) =>
        record.kind === "element" ? (
          <UserMessageContextPopover
            copyMarkdown={context.copyMarkdown}
            accessibleLabel={`Browser item, ${record.label}`}
            kind="element"
            icon={<MousePointerClickIcon />}
            label={record.label}
          >
            <UserMessageElementDetails record={record} />
          </UserMessageContextPopover>
        ) : (
          <UnavailableUserMessageContextChip {...context} />
        ),
    },
    {
      kind: "review-comment",
      canRender: (record) => record.kind === "review-comment",
      render: (record, context) => {
        if (record.kind !== "review-comment") {
          return <UnavailableUserMessageContextChip {...context} />;
        }
        const isPullRequest = isPullRequestSummaryContext(record);
        const label = reviewCommentContextLabel(record);
        const kindLabel = isPullRequest ? pullRequestContextKindLabel(record) : "Review note";
        const pullRequestState = pullRequestContextDisplayState(record) ?? "unknown";
        if (isPullRequest && record.pullRequest !== undefined) {
          return (
            <UserMessagePullRequestContextChip
              record={record}
              copyMarkdown={context.copyMarkdown}
              kind={PULL_REQUEST_CHIP_KINDS[pullRequestState]}
            />
          );
        }
        return (
          <UserMessageContextPopover
            copyMarkdown={context.copyMarkdown}
            accessibleLabel={`${kindLabel}, ${label}${record.pullRequest ? `, ${record.pullRequest.title}` : ""}`}
            kind={isPullRequest ? PULL_REQUEST_CHIP_KINDS[pullRequestState] : "review-comment"}
            icon={isPullRequest ? <PullRequestGlyph.pullRequest /> : <MessageCircleIcon />}
            label={label}
          >
            <UserMessageReviewCommentCard
              comment={{
                id: record.contextId,
                sectionId: record.sectionId,
                sectionTitle: record.sectionTitle,
                filePath: record.filePath,
                startIndex: record.startIndex,
                endIndex: record.endIndex,
                rangeLabel: record.rangeLabel,
                text: record.text,
                diff: record.diff,
                ...(record.fenceLanguage !== undefined
                  ? { fenceLanguage: record.fenceLanguage }
                  : {}),
                ...(record.pullRequest !== undefined ? { pullRequest: record.pullRequest } : {}),
              }}
            />
          </UserMessageContextPopover>
        );
      },
    },
    {
      kind: "preview-annotation",
      canRender: (record) => record.kind === "preview-annotation",
      render: (record, context) =>
        record.kind === "preview-annotation" ? (
          <UserMessageContextPopover
            copyMarkdown={context.copyMarkdown}
            accessibleLabel={`Note on the preview, ${record.label}`}
            kind="preview-annotation"
            icon={<MousePointerClickIcon />}
            label={record.label}
          >
            <UserMessagePreviewAnnotationDetails record={record} image={context.annotationImage} />
          </UserMessageContextPopover>
        ) : (
          <UnavailableUserMessageContextChip {...context} />
        ),
    },
  ],
  fallback: (_kind, _record, context) => <UnavailableUserMessageContextChip {...context} />,
});

/** One inline context chip in a sent message, dispatched by the shared presentation registry. */
export function UserMessageContextReferenceChip(props: {
  reference: ChatMarkdownContextReference;
  record: KnownComposerContextRecord | undefined;
  annotationImage: ChatImageAttachment | null;
  attachment: ChatImageAttachment | ChatFileAttachment | null;
  onExpandImage: (image: ChatImageAttachment) => void;
  onExpandVideo: (file: ChatFileAttachment) => void;
  onOpenFile: (file: ChatFileAttachment) => void;
}) {
  const { resolvedTheme, activeThreadEnvironmentId } = use(TimelineRowCtx);
  const copyMarkdown = formatComposerContextReference({
    kind: props.reference.kind,
    contextId: props.reference.contextId as ComposerContextId,
    label: props.reference.label,
  });
  return userMessageContextPresentationRegistry.render(props.reference.kind, props.record, {
    environmentId: activeThreadEnvironmentId,
    reference: props.reference,
    annotationImage: props.annotationImage,
    attachment: props.attachment,
    resolvedTheme,
    copyMarkdown,
    onExpandImage: props.onExpandImage,
    onExpandVideo: props.onExpandVideo,
    onOpenFile: props.onOpenFile,
  });
}

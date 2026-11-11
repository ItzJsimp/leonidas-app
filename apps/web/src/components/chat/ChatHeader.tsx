import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ThreadId,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { ChevronDownIcon } from "lucide-react";
import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { isTrailingDoubleClick } from "../Sidebar.logic";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import { useThreadActionMenu } from "~/hooks/useThreadActionMenu";
import { readLocalApi } from "~/localApi";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import { WorkspaceBreadcrumbText } from "../WorkspaceBreadcrumb";
import { cn } from "~/lib/utils";
import { useChatHeaderLeading } from "./ChatHeaderLeading";
import { LocalVmPanel } from "../localVm/LocalVmPanel";
import { userErrorToastFields } from "~/lib/userErrorToast";

interface ChatHeaderProps {
  /** The goal dialog; the title menu opens it through `onOpenGoal`. */
  goalControls?: ReactNode;
  hasGoal?: boolean;
  onOpenGoal?: (() => void) | undefined;
  /** True when this header's layout cluster also holds the bell and split toggle. */
  hostsShellCorner?: boolean;
  activeThreadEnvironmentId: EnvironmentId;
  activeThreadId: ThreadId;
  activeThreadTitle: string;
  isServerThread: boolean;
  activeProject: EnvironmentProject | null;
  parentThreadLink: { threadId: ThreadId; title: string } | null;
  onOpenThread: (threadId: ThreadId) => void;
  rightPanelOpen: boolean;
  /** The chat details panel is open beside the chat: center the title in the space left of it. */
  centerBesidePanel?: boolean;
  /** The header shares the title bar with the native window buttons. */
  nativeControlsInset?: boolean;
  onNewThreadInProject: () => void;
  onOpenProjectSettings?: (() => void) | undefined;
}

export function resolveRenameCommit(input: {
  readonly title: string;
  readonly originalTitle: string;
}): { action: "commit"; title: string } | { action: "reject-empty" } | { action: "noop" } {
  const trimmed = input.title.trim();
  if (trimmed.length === 0) return { action: "reject-empty" };
  if (trimmed === input.originalTitle) return { action: "noop" };
  return { action: "commit", title: trimmed };
}

// How long a click on the thread title waits before opening the action menu, so
// a double-click-to-rename can cancel it first. Only the native desktop menu
// needs this: it swallows input while open, so the wait must cover the OS
// double-click interval.
const TITLE_MENU_OPEN_DELAY_MS = 500;
export const ChatHeader = memo(function ChatHeader({
  activeThreadEnvironmentId,
  activeThreadId,
  activeThreadTitle,
  isServerThread,
  activeProject,
  parentThreadLink,
  onOpenThread,
  rightPanelOpen,
  centerBesidePanel = false,
  nativeControlsInset = false,
  onNewThreadInProject,
  onOpenProjectSettings,
  goalControls,
  hasGoal = false,
  onOpenGoal,
  hostsShellCorner = false,
}: ChatHeaderProps) {
  const leading = useChatHeaderLeading();
  const activeProjectName = activeProject?.isScratch
    ? "No project"
    : (activeProject?.title ?? null);
  const activeProjectCwd = activeProject?.workspaceRoot ?? null;
  const [aiDesktopOpen, setAiDesktopOpen] = useState(false);
  const activeThreadRef = scopeThreadRef(activeThreadEnvironmentId, activeThreadId);
  const canOperateThread = useEnvironmentScope(
    activeThreadEnvironmentId,
    AuthOrchestrationOperateScope,
  );
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const [renaming, setRenaming] = useState<{
    threadId: ThreadId;
    environmentId: EnvironmentId;
    title: string;
  } | null>(null);
  if (
    renaming !== null &&
    (renaming.threadId !== activeThreadId ||
      renaming.environmentId !== activeThreadEnvironmentId ||
      !canOperateThread)
  ) {
    setRenaming(null);
  }
  const renamingTitle =
    canOperateThread &&
    renaming?.threadId === activeThreadId &&
    renaming.environmentId === activeThreadEnvironmentId
      ? renaming.title
      : null;
  const renameCommittedRef = useRef(false);
  const startRename = () => {
    if (
      !isServerThread ||
      !readEnvironmentScope(activeThreadEnvironmentId, AuthOrchestrationOperateScope)
    )
      return;
    renameCommittedRef.current = false;
    setRenaming({
      environmentId: activeThreadEnvironmentId,
      threadId: activeThreadId,
      title: activeThreadTitle,
    });
  };
  const commitRename = (title: string) => {
    setRenaming(null);
    if (!readEnvironmentScope(activeThreadEnvironmentId, AuthOrchestrationOperateScope)) return;
    const resolution = resolveRenameCommit({ title, originalTitle: activeThreadTitle });
    if (resolution.action === "reject-empty") {
      toastManager.add({ type: "warning", title: "The chat name cannot be empty. Type a name." });
      return;
    }
    if (resolution.action === "noop") return;
    void updateThreadMetadata({
      environmentId: activeThreadEnvironmentId,
      input: { threadId: activeThreadId, title: resolution.title },
    }).then((result) => {
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: "Failed to rename thread",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
    });
  };
  const { openMenu, closeMenu } = useThreadActionMenu({
    threadRef: isServerThread ? activeThreadRef : null,
    projectCwd: activeProjectCwd,
    onStartRename: startRename,
    header: {
      projectName: activeProjectName,
      parentTitle: parentThreadLink?.title ?? null,
      hasGoal: onOpenGoal ? hasGoal : null,
      aiDesktopOpen: isServerThread ? aiDesktopOpen : null,
      onAction: (action) => {
        if (action === "open-parent-chat" && parentThreadLink) {
          onOpenThread(parentThreadLink.threadId);
        } else if (action === "new-chat-in-project") onNewThreadInProject();
        else if (action === "goal") onOpenGoal?.();
        else if (action === "ai-desktop") setAiDesktopOpen((open) => !open);
      },
    },
  });
  const titleButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleMenuTimerRef = useRef<number | null>(null);
  const cancelPendingTitleMenu = () => {
    if (titleMenuTimerRef.current === null) return;
    clearTimeout(titleMenuTimerRef.current);
    titleMenuTimerRef.current = null;
  };
  useEffect(
    () => () => {
      if (titleMenuTimerRef.current === null) return;
      clearTimeout(titleMenuTimerRef.current);
      titleMenuTimerRef.current = null;
    },
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A pending title menu belongs to the thread that was clicked, so switching threads drops it.
    [activeThreadEnvironmentId, activeThreadId],
  );
  const openTitleMenuNow = () => {
    cancelPendingTitleMenu();
    const rect = titleButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    openMenu({ x: rect.left, y: rect.bottom + 4 });
  };
  const openMenuFromTitle = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (isTrailingDoubleClick(event.detail)) return;
    const clickedChevron =
      (event.target as HTMLElement).closest("[data-thread-title-chevron]") !== null;
    if (event.detail === 0 || clickedChevron || window.desktopBridge === undefined) {
      openTitleMenuNow();
      return;
    }
    cancelPendingTitleMenu();
    titleMenuTimerRef.current = window.setTimeout(() => {
      titleMenuTimerRef.current = null;
      openTitleMenuNow();
    }, TITLE_MENU_OPEN_DELAY_MS);
  };
  const handleTitleDoubleClick = (event: ReactMouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if ((event.target as HTMLElement).closest("[data-thread-title-chevron]") !== null) return;
    cancelPendingTitleMenu();
    closeMenu();
    startRename();
  };
  const handleHeaderContextMenu = (event: ReactMouseEvent) => {
    if (renamingTitle !== null) return;
    if (!isServerThread && onOpenProjectSettings === undefined) return;
    cancelPendingTitleMenu();
    event.preventDefault();
    if (!isServerThread) {
      const api = readLocalApi();
      if (!api) return;
      void api.contextMenu
        .show([{ id: "project-settings", label: "Project settings", icon: "settings" }], {
          x: event.clientX,
          y: event.clientY,
        })
        .then((action) => {
          if (action === "project-settings") onOpenProjectSettings?.();
        });
      return;
    }
    openMenu({ x: event.clientX, y: event.clientY });
  };
  const handleRenameKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter") {
      renameCommittedRef.current = true;
      commitRename(event.currentTarget.value);
    } else if (event.key === "Escape") {
      renameCommittedRef.current = true;
      setRenaming(null);
    }
  };
  return (
    <div
      // Three columns: leading controls, the title, and room for the fixed layout cluster.
      // The equal side columns center the title on the chat axis; a long title moves aside.
      className={cn(
        "grid min-w-0 flex-1 grid-cols-[minmax(max-content,1fr)_minmax(0,auto)_minmax(var(--chat-header-end-guard),1fr)] items-center gap-1",
        // The fixed layout cluster: five buttons, or seven with the bell and split toggle.
        // Phones drop the pane-layout, terminal and memory buttons: details, side panel and bell remain.
        rightPanelOpen
          ? "[--chat-header-cluster:2.5rem]"
          : hostsShellCorner
            ? "[--chat-header-cluster:14rem] max-sm:[--chat-header-cluster:7.5rem]"
            : "[--chat-header-cluster:11rem] max-sm:[--chat-header-cluster:5.5rem]",
      )}
      style={
        {
          "--chat-header-reserve": centerBesidePanel
            ? "calc(var(--thread-details-panel-width) + 0.75rem)"
            : "0px",
          "--chat-header-end-guard": `max(0px, calc(var(--chat-header-cluster) + ${
            nativeControlsInset ? "var(--workspace-native-controls-inset)" : "0px"
          } - var(--chat-header-reserve)))`,
          marginInlineEnd: "var(--chat-header-reserve)",
        } as CSSProperties
      }
      onContextMenu={handleHeaderContextMenu}
    >
      <div className="flex min-w-0 items-center gap-1 justify-self-start">{leading}</div>
      <div className="flex min-w-0 items-center gap-1">
        {/* Sized to the text, so the empty header around it still drags the window. */}
        <div className="flex min-w-0 items-center text-sm font-medium text-foreground">
          {renamingTitle !== null ? (
            <input
              autoFocus
              aria-label="Chat name"
              className="w-80 max-w-full min-w-0 rounded-sm bg-transparent px-1 text-sm font-medium text-foreground outline-none ring-1 ring-inset ring-ring/50 focus:ring-ring"
              defaultValue={renamingTitle}
              onBlur={(event) => {
                if (renameCommittedRef.current) return;
                // Focus landing on a navigation button means the rename was
                // abandoned, so discard it rather than persisting a half-draft.
                if (
                  event.relatedTarget instanceof HTMLElement &&
                  event.relatedTarget.closest("button")
                ) {
                  setRenaming(null);
                  return;
                }
                commitRename(event.currentTarget.value);
              }}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={handleRenameKeyDown}
            />
          ) : isServerThread ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    ref={titleButtonRef}
                    type="button"
                    aria-label={`Open chat actions for ${activeThreadTitle}`}
                    aria-haspopup="menu"
                    onClick={openMenuFromTitle}
                    onDoubleClick={canOperateThread ? handleTitleDoubleClick : undefined}
                    onBlur={cancelPendingTitleMenu}
                    // The start inset matches the hover chevron, so the visible title sits on the chat axis.
                    className="group/thread-title relative touch-hit inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-sm ps-5.5 pe-1 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  />
                }
              >
                <h2 className="min-w-0 font-display">
                  <WorkspaceBreadcrumbText>{activeThreadTitle}</WorkspaceBreadcrumbText>
                </h2>
                <ChevronDownIcon
                  aria-hidden
                  data-thread-title-chevron
                  className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/thread-title:opacity-100 group-focus-visible/thread-title:opacity-100"
                />
              </TooltipTrigger>
              <TooltipPopup side="bottom">
                {activeProjectName
                  ? `${activeThreadTitle} in ${activeProjectName}`
                  : activeThreadTitle}
              </TooltipPopup>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={<h2 aria-label={activeThreadTitle} className="min-w-0 px-1 font-display" />}
              >
                <WorkspaceBreadcrumbText>{activeThreadTitle}</WorkspaceBreadcrumbText>
              </TooltipTrigger>
              <TooltipPopup side="bottom">
                {activeProjectName
                  ? `${activeThreadTitle} in ${activeProjectName}`
                  : activeThreadTitle}
              </TooltipPopup>
            </Tooltip>
          )}
        </div>
        {goalControls}
        {isServerThread && aiDesktopOpen ? (
          <LocalVmPanel
            key={`${activeThreadEnvironmentId}:${activeThreadId}`}
            environmentId={activeThreadEnvironmentId}
            threadId={activeThreadId}
            onClose={() => setAiDesktopOpen(false)}
          />
        ) : null}
      </div>
      <span aria-hidden />
    </div>
  );
});

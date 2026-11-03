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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  /** Drafts have no server thread yet, so the title carries no action menu. */
  isServerThread: boolean;
  activeProject: EnvironmentProject | null;
  parentThreadLink: { threadId: ThreadId; title: string } | null;
  onOpenThread: (threadId: ThreadId) => void;
  rightPanelOpen: boolean;
  onNewThreadInProject: () => void;
  onOpenProjectSettings?: (() => void) | undefined;
}

/**
 * Rename commit rule shared with the sidebar's inline rename: trim, reject
 * empty (the caller toasts), and skip the mutation when nothing changed.
 */
export function resolveRenameCommit(input: {
  readonly title: string;
  readonly originalTitle: string;
}): { action: "commit"; title: string } | { action: "reject-empty" } | { action: "noop" } {
  const trimmed = input.title.trim();
  if (trimmed.length === 0) return { action: "reject-empty" };
  if (trimmed === input.originalTitle) return { action: "noop" };
  return { action: "commit", title: trimmed };
}

// How long a click on the thread title waits before opening the action menu,
// so a double-click-to-rename can cancel it first. Only the native desktop
// menu needs this: it swallows input while open, so the wait must cover the
// OS double-click interval. The browser fallback menu keeps seeing DOM
// events (the second click dismisses it and dblclick still fires), so it
// opens immediately.
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
  onNewThreadInProject,
  onOpenProjectSettings,
  goalControls,
  hasGoal = false,
  onOpenGoal,
  hostsShellCorner = false,
}: ChatHeaderProps) {
  const leading = useChatHeaderLeading();
  const activeProjectName = activeProject?.title ?? null;
  const activeProjectCwd = activeProject?.workspaceRoot ?? null;
  const [aiDesktopOpen, setAiDesktopOpen] = useState(false);
  const activeThreadRef = useMemo(
    () => scopeThreadRef(activeThreadEnvironmentId, activeThreadId),
    [activeThreadEnvironmentId, activeThreadId],
  );
  const canOperateThread = useEnvironmentScope(
    activeThreadEnvironmentId,
    AuthOrchestrationOperateScope,
  );
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  // Inline rename, keyed by thread: navigating away drops an in-progress
  // rename instead of committing stale text. Cleared on thread change (not
  // just hidden) so returning to the thread doesn't revive the old draft.
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
  const startRename = useCallback(() => {
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
  }, [activeThreadEnvironmentId, activeThreadId, activeThreadTitle, isServerThread]);
  const commitRename = useCallback(
    (title: string) => {
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
            ...userErrorToastFields(error),
          });
        }
      });
    },
    [activeThreadEnvironmentId, activeThreadId, activeThreadTitle, updateThreadMetadata],
  );
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
  const cancelPendingTitleMenu = useCallback(() => {
    if (titleMenuTimerRef.current === null) return;
    clearTimeout(titleMenuTimerRef.current);
    titleMenuTimerRef.current = null;
  }, []);
  // Drop a pending menu-open when the thread changes or the header unmounts,
  // so it can never fire for a thread the user already left.
  useEffect(
    () => () => {
      cancelPendingTitleMenu();
    },
    [activeThreadEnvironmentId, activeThreadId, cancelPendingTitleMenu],
  );
  const openTitleMenuNow = useCallback(() => {
    cancelPendingTitleMenu();
    const rect = titleButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    openMenu({ x: rect.left, y: rect.bottom + 4 });
  }, [cancelPendingTitleMenu, openMenu]);
  const openMenuFromTitle = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      // The trailing click of a double-click belongs to rename, not the menu.
      if (isTrailingDoubleClick(event.detail)) return;
      // Keyboard activation and the explicit chevron affordance can never be
      // the first half of a double-click, so they open without waiting.
      const clickedChevron =
        (event.target as HTMLElement).closest("[data-thread-title-chevron]") !== null;
      if (event.detail === 0 || clickedChevron || window.desktopBridge === undefined) {
        openTitleMenuNow();
        return;
      }
      // Stay pending long enough for dblclick to cancel the open before the
      // native menu appears and swallows the second click.
      cancelPendingTitleMenu();
      titleMenuTimerRef.current = window.setTimeout(() => {
        titleMenuTimerRef.current = null;
        openTitleMenuNow();
      }, TITLE_MENU_OPEN_DELAY_MS);
    },
    [cancelPendingTitleMenu, openTitleMenuNow],
  );
  const handleTitleDoubleClick = useCallback(
    (event: ReactMouseEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      // The chevron is the explicit menu affordance; only the title text renames.
      if ((event.target as HTMLElement).closest("[data-thread-title-chevron]") !== null) return;
      cancelPendingTitleMenu();
      closeMenu();
      startRename();
    },
    [cancelPendingTitleMenu, closeMenu, startRename],
  );
  const handleHeaderContextMenu = useCallback(
    (event: ReactMouseEvent) => {
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
    },
    [cancelPendingTitleMenu, isServerThread, onOpenProjectSettings, openMenu, renamingTitle],
  );
  const handleRenameKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === "Enter") {
        renameCommittedRef.current = true;
        commitRename(event.currentTarget.value);
      } else if (event.key === "Escape") {
        renameCommittedRef.current = true;
        setRenaming(null);
      }
    },
    [commitRename],
  );
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1",
        // Clears the fixed layout cluster: five buttons, or seven with the bell and split toggle.
        // Phones drop the pane-layout, terminal and memory buttons: details, side panel and bell remain.
        rightPanelOpen ? "pr-10" : hostsShellCorner ? "pr-56 max-sm:pr-30" : "pr-44 max-sm:pr-22",
      )}
      onContextMenu={handleHeaderContextMenu}
    >
      {leading}
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
                  className="group/thread-title inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-sm px-1 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
  );
});

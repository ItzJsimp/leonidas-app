import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useState,
  type ReactNode,
} from "react";
import {
  DraftId,
  type ComposerThreadDraftState,
  type DraftSessionState,
  useComposerDraftStore,
  composerDraftHasUserContent,
} from "../../composerDraftStore";
import { type ProjectFaviconProject, ProjectFavicon } from "../ProjectFavicon";
import { replaceComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import { resolveSidebarRowAccessibility, type SidebarDropVerb } from "../Sidebar.logic";
import { cn } from "~/lib/utils";
import {
  SquarePenIcon,
  XIcon,
  PinIcon,
  PinOffIcon,
  ArchiveIcon,
  Undo2Icon,
  AlarmClockOffIcon,
} from "lucide-react";
import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { type EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { discardComposerDraft } from "../../lib/discardComposerDraft";

export const draftSurfaceClassName = "bg-warning-surface/35 hover:bg-warning-surface/55";

export const draftPenClassName = "size-3.5 shrink-0 text-warning-foreground";

// Compact unsent draft row with amber pen icon, Draft pill, project/Unsent meta line,
// and discard button. Memoized with a frozen entry snapshot so typing never repaints the list.
const SidebarDraftRow = memo(function SidebarDraftRow(props: {
  draftId: DraftId;
  composer: ComposerThreadDraftState;
  project: ProjectFaviconProject | null;
  projectDisplayName: string | null;
  showProject: boolean;
  isActive: boolean;
  onNavigate: (draftId: DraftId) => void;
  onDiscard: (draftId: DraftId) => void;
  onContextMenu: (draftId: DraftId, position: { x: number; y: number }) => void;
}) {
  const { composer, draftId, onContextMenu, onDiscard, onNavigate } = props;
  const promptPreview =
    replaceComposerContextReferences(composer.prompt, (occurrence) => occurrence.label)
      .trim()
      .split("\n", 1)[0] ?? "";
  // images mirrors persistedAttachments once rehydration finishes; before
  // that only the persisted list is populated, hence max not sum.
  const attachmentCount =
    Math.max(composer.images.length, composer.persistedAttachments.length) +
    composer.files.length +
    composer.terminalContexts.length +
    composer.previewAnnotations.length +
    composer.reviewComments.length;
  const preview =
    promptPreview.length > 0
      ? promptPreview
      : `${attachmentCount} attachment${attachmentCount === 1 ? "" : "s"}`;
  const accessibility = resolveSidebarRowAccessibility({
    title: preview,
    statusLabel: "Unsent draft",
    projectDisplayName: props.projectDisplayName,
    isActive: props.isActive,
  });
  const handleActivate = () => onNavigate(draftId);
  const handleKeyDown = (event: ReactKeyboardEvent) => {
    // Keys targeting the nested discard button belong to the button:
    // preventDefault here would swallow Space's synthesized click and
    // navigate instead of discarding.
    if ((event.target as HTMLElement).closest("button")) return;
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      onContextMenu(draftId, { x: rect.left, y: rect.bottom });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onNavigate(draftId);
    }
  };
  const handleContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    onContextMenu(draftId, { x: event.clientX, y: event.clientY });
  };
  const handleDiscard = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onDiscard(draftId);
  };
  return (
    <li className="list-none py-0.5">
      <div
        role="button"
        tabIndex={0}
        aria-label={accessibility.label}
        aria-current={accessibility.current}
        data-testid="sidebar-draft-row"
        className={cn(
          "group/sidebar-row relative min-h-12 w-full cursor-pointer overflow-hidden rounded-md border px-2 py-1.5 text-left text-sidebar-foreground outline-none select-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
          props.isActive
            ? "border-warning/40 bg-sidebar-row-active"
            : cn("border-warning/25", draftSurfaceClassName),
        )}
        onClick={handleActivate}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
      >
        <span className="sr-only">{preview}</span>
        <div className="relative z-10 flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <SquarePenIcon aria-hidden className={draftPenClassName} />
            <span
              aria-hidden
              className="min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground"
            >
              {preview}
            </span>
            <span className="shrink-0 rounded-sm border border-warning/30 bg-warning-surface/75 px-1.5 text-3xs font-medium leading-4 text-warning-foreground">
              Draft
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Discard draft"
                    onClick={handleDiscard}
                    className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-sm bg-transparent text-sidebar-muted-foreground opacity-70 transition-opacity hover:bg-sidebar-row-active hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring group-hover/sidebar-row:opacity-100 motion-reduce:transition-none"
                  >
                    <XIcon className="size-3" />
                  </button>
                }
              />
              <TooltipPopup side="top">Discard draft</TooltipPopup>
            </Tooltip>
          </div>
          <div
            aria-hidden
            className="flex min-w-0 items-center gap-1.5 pl-5 text-2xs text-sidebar-muted-foreground"
          >
            {props.showProject && props.projectDisplayName ? (
              <>
                {props.project ? (
                  <ProjectFavicon project={props.project} className="size-3 shrink-0" />
                ) : null}
                <span className="min-w-0 truncate">{props.projectDisplayName}</span>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span className="shrink-0">Unsent</span>
          </div>
        </div>
      </div>
    </li>
  );
});

interface SidebarDraftRowData {
  draftId: DraftId;
  session: DraftSessionState;
  composer: ComposerThreadDraftState;
}

// Draft sessions with user content, surfaced in a collapsible Drafts section so an
// interrupted "new thread" stays one click away. Self-contained (own store
// subscription) so per-keystroke composer updates re-render only this block,
// never the whole sidebar. Vanishes at count 0.
export const SidebarDraftBlock = memo(function SidebarDraftBlock(props: {
  projectByKey: ReadonlyMap<string, EnvironmentProject>;
  projectDisplayNameByKey: ReadonlyMap<string, string>;
  scopedProjectKeys: ReadonlySet<string> | null;
  routeDraftId: string | null;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  showProject?: boolean;
  onNavigateToDraft: (draftId: DraftId) => void;
  onDraftContextMenu: (draftId: DraftId, position: { x: number; y: number }) => void;
}) {
  const draftThreadsByThreadKey = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  const draftsByThreadKey = useComposerDraftStore((store) => store.draftsByThreadKey);
  // The open draft's row is FROZEN at the moment the draft became the route:
  // it stays visible (like a thread row) but never repaints while the user
  // types. A draft that was never navigated away from has no snapshot to
  // freeze, so a fresh typing session shows no row at all. Captured
  // synchronously on route change (setState-during-render derived state) so
  // the row never flickers out for a frame between route change and capture.
  const [frozenActive, setFrozenActive] = useState<{
    routeDraftId: string | null;
    row: SidebarDraftRowData | null;
  }>({ routeDraftId: null, row: null });
  if (frozenActive.routeDraftId !== props.routeDraftId) {
    let row: SidebarDraftRowData | null = null;
    if (props.routeDraftId !== null) {
      const draftId = DraftId.make(props.routeDraftId);
      const session = draftThreadsByThreadKey[draftId];
      const composer = draftsByThreadKey[draftId];
      row =
        session && session.promotedTo == null && composer && composerDraftHasUserContent(composer)
          ? { draftId, session, composer }
          : null;
    }
    setFrozenActive({ routeDraftId: props.routeDraftId, row });
  }
  const drafts: SidebarDraftRowData[] = [];
  // Every non-promoted session with content gets a row, mapped or not:
  // new-thread surfaces mint fresh drafts and leave invested ones behind
  // unmapped, so the mapping only knows about the latest per project.
  for (const [draftKey, session] of Object.entries(draftThreadsByThreadKey)) {
    if (session.promotedTo != null) {
      continue;
    }
    if (
      props.scopedProjectKeys !== null &&
      !props.scopedProjectKeys.has(`${session.environmentId}:${session.projectId}`)
    ) {
      continue;
    }
    if (draftKey === props.routeDraftId) {
      // Open draft: render the frozen entry snapshot, or nothing for a
      // draft that has never been left. Gated on the LIVE session above so
      // send/discard still removes the row immediately.
      if (frozenActive.routeDraftId === draftKey && frozenActive.row !== null) {
        drafts.push(frozenActive.row);
      }
      continue;
    }
    const composer = draftsByThreadKey[draftKey];
    if (!composer || !composerDraftHasUserContent(composer)) {
      continue;
    }
    drafts.push({ draftId: DraftId.make(draftKey), session, composer });
  }
  drafts.sort((left, right) => right.session.createdAt.localeCompare(left.session.createdAt));
  if (drafts.length === 0) {
    return null;
  }
  const expanded = props.expanded ?? true;
  const showProject = props.showProject ?? true;
  const visibleDrafts = expanded
    ? drafts
    : drafts.filter((draft) => draft.draftId === props.routeDraftId);
  return (
    <>
      <li role="presentation" className="mx-0.5 list-none">
        <CollapsibleSectionHeader
          expanded={expanded}
          onClick={props.onToggleExpanded}
          accessory={<span className="text-2xs font-normal tabular-nums">{drafts.length}</span>}
          data-testid="sidebar-drafts-shelf-toggle"
        >
          Drafts
        </CollapsibleSectionHeader>
      </li>
      {visibleDrafts.map(({ composer, draftId, session }) => {
        const projectKey = `${session.environmentId}:${session.projectId}`;
        return (
          <SidebarDraftRow
            key={draftId}
            draftId={draftId}
            composer={composer}
            project={props.projectByKey.get(projectKey) ?? null}
            projectDisplayName={props.projectDisplayNameByKey.get(projectKey) ?? null}
            showProject={showProject}
            isActive={draftId === props.routeDraftId}
            onNavigate={props.onNavigateToDraft}
            // The /draft/$draftId route redirects home on its own when the
            // draft it renders disappears, so discarding the open draft needs
            // no special-casing here.
            onDiscard={discardComposerDraft}
            onContextMenu={props.onDraftContextMenu}
          />
        );
      })}
    </>
  );
});

// Verb and icon on the lifted row while it hovers over another section. Uses
// the same icons as the row actions and context menu so the drop reads as the
// action it performs.
export const dropVerbBadge: Record<SidebarDropVerb, ReactNode> = {
  pin: (
    <>
      <PinIcon aria-hidden className="size-3" />
      Pin
    </>
  ),
  unpin: (
    <>
      <PinOffIcon aria-hidden className="size-3" />
      Unpin
    </>
  ),
  settle: (
    <>
      <ArchiveIcon aria-hidden className="size-3" />
      Archive
    </>
  ),
  unsettle: (
    <>
      <Undo2Icon aria-hidden className="size-3" />
      Unarchive
    </>
  ),
  wake: (
    <>
      <AlarmClockOffIcon aria-hidden className="size-3" />
      Bring back
    </>
  ),
};

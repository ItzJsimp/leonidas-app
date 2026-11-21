import "../../index.css";
import { act, render } from "../../../test/render";
import { useRef, useState } from "react";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type SidebarThreadSortOrder,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

const togglePinMock = vi.fn();
vi.mock("../twoState/useRailItems", () => ({
  useRailItems: () => ({
    pinned: [{ id: "inbox", label: "Inbox", to: "/inbox", tooltip: "Inbox" }],
    pinnable: [{ id: "inbox", label: "Inbox", to: "/inbox", tooltip: "Inbox" }],
    togglePin: togglePinMock,
  }),
}));

vi.mock("../twoState/useTwoStateData", () => ({
  useTwoStateCounts: () => ({ needsYou: 2 }),
}));

import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { SidebarProvider } from "../ui/sidebar";
import { TooltipProvider } from "../ui/tooltip";
import { SidebarDraftBlock } from "./LeoSidebarDraftBlock";
import { SidebarGroupHeading } from "./LeoSidebarListMarkers";
import { SidebarThreadHeader } from "./SidebarThreadHeader";
import { SidebarViewMenu } from "./SidebarViewMenu";
import { DEFAULT_SIDEBAR_VIEW } from "./sidebarView.logic";
import { useSidebarViewStore } from "./sidebarViewStore";

function resetSidebarRedesignState() {
  const stack = new DisposableStack();
  useSidebarViewStore.getState().resetView();
  togglePinMock.mockClear();
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    stickyModelSelectionByProvider: {},
    stickyActiveProvider: null,
  });
  stack.defer(() => {
    useSidebarViewStore.getState().resetView();
    useComposerDraftStore.setState({
      draftsByThreadKey: {},
      draftThreadsByThreadKey: {},
      logicalProjectDraftThreadKeyByLogicalProjectKey: {},
      stickyModelSelectionByProvider: {},
      stickyActiveProvider: null,
    });
  });
  return stack;
}

describe("SidebarViewMenu redesign", () => {
  it("renders Display header, 5 group tiles, segmented controls, and Switch rows for Show on rows", async () => {
    using _cleanup = resetSidebarRedesignState();
    const onSortOrderChange = vi.fn();
    function Harness() {
      const anchorRef = useRef<HTMLDivElement | null>(null);
      const [sortOrder, setSortOrder] = useState<SidebarThreadSortOrder>("updated_at");
      return (
        <div>
          <div ref={anchorRef}>Anchor</div>
          <SidebarViewMenu
            open
            onOpenChange={() => {}}
            anchor={anchorRef}
            sortOrder={sortOrder}
            onSortOrderChange={(next) => {
              setSortOrder(next);
              onSortOrderChange(next);
            }}
          />
        </div>
      );
    }

    await using screen = await render(<Harness />);
    void screen;

    const dialog = page.getByLabelText("Display options");
    await expect.element(dialog).toBeVisible();
    await expect.element(page.getByText("Display", { exact: true })).toBeVisible();

    const resetButton = page.getByRole("button", { name: "Reset" });
    await expect.element(resetButton).toBeDisabled();

    // 5-column Group by tiles
    for (const label of ["Date", "Status", "Project", "Account", "Manual"]) {
      await expect.element(page.getByRole("button", { name: label })).toBeVisible();
    }
    await page.getByRole("button", { name: "Status" }).click();
    expect(useSidebarViewStore.getState().view.groupBy).toBe("status");
    await expect.element(page.getByText("Needs you, Running, Ready, Recent")).toBeVisible();
    await expect.element(resetButton).toBeEnabled();

    // Segmented controls for Sort by and Row density
    await page.getByRole("button", { name: "Created" }).click();
    expect(onSortOrderChange).toHaveBeenCalledWith("created_at");

    await page.getByRole("button", { name: "Compact" }).click();
    expect(useSidebarViewStore.getState().view.density).toBe("compact");

    // Show on rows must be Switch toggles, not rectangular chips
    for (const label of ["Project rail", "Project name", "Status line", "Time"]) {
      await expect.element(page.getByRole("switch", { name: label })).toBeVisible();
    }

    await page.getByRole("switch", { name: "Project rail" }).click();
    expect(useSidebarViewStore.getState().view.showRail).toBe(true);

    await page.getByRole("switch", { name: "Time" }).click();
    expect(useSidebarViewStore.getState().view.showTime).toBe(false);

    // Reset restores view and sort order
    await resetButton.click();
    expect(useSidebarViewStore.getState().view).toEqual(DEFAULT_SIDEBAR_VIEW);
    expect(onSortOrderChange).toHaveBeenLastCalledWith("updated_at");
    await expect.element(resetButton).toBeDisabled();
  });
});

describe("SidebarThreadHeader redesign", () => {
  function renderHeader(overrides: Partial<React.ComponentProps<typeof SidebarThreadHeader>> = {}) {
    function Harness() {
      const searchFieldRef = useRef<HTMLDivElement | null>(null);
      const searchInputRef = useRef<HTMLInputElement | null>(null);
      const [query, setQuery] = useState(overrides.searchQuery ?? "");
      return (
        <SidebarProvider open>
          <TooltipProvider delay={0}>
            <SidebarThreadHeader
              searchFieldRef={searchFieldRef}
              hasProjects
              projectScope={null}
              projectScopeLabel="All projects"
              isProjectScoped={false}
              onOpenProjectScope={() => {}}
              sortOrder="updated_at"
              onSortOrderChange={() => {}}
              needsAttentionOnly={false}
              onNeedsAttentionOnlyChange={() => {}}
              unreadCount={3}
              onMarkAllRead={() => {}}
              anySectionExpanded
              onToggleCollapseAllSections={() => {}}
              sweep={{ environmentId: EnvironmentId.make("env-1"), cwd: "/repo" }}
              onNewProject={() => {}}
              onNewThread={() => {}}
              newThreadDisabled={false}
              newThreadShortcutLabel="Cmd+N"
              newThreadInProjectShortcutLabel="Cmd+Shift+N"
              showNewThreadInProjectHint={false}
              searchInputRef={searchInputRef}
              searchQuery={query}
              onSearchQueryChange={setQuery}
              onSearchKeyDown={() => {}}
              isSearching={query.length > 0}
              searchResultCount={0}
              activeSearchResultIndex={0}
              onClearSearch={() => setQuery("")}
              {...overrides}
            />
          </TooltipProvider>
        </SidebarProvider>
      );
    }
    return render(<Harness />);
  }

  it("places Search, Filter, and More above New chat and shows active filter dot only when scoped", async () => {
    using _cleanup = resetSidebarRedesignState();
    await using screen = await renderHeader({ isProjectScoped: false });

    const searchInput = screen.container.querySelector<HTMLElement>('[aria-label="Search chats"]')!;
    const filterButton = screen.container.querySelector<HTMLElement>(
      '[aria-label="Filter by project"]',
    )!;
    const moreButton = screen.container.querySelector<HTMLElement>('[aria-label="More options"]')!;
    const newChatButton = screen.container.querySelector<HTMLElement>(
      '[data-usage-id="new_thread"]',
    )!;

    expect(
      searchInput.compareDocumentPosition(newChatButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      filterButton.compareDocumentPosition(newChatButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      moreButton.compareDocumentPosition(newChatButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.container.querySelector('[data-testid="sidebar-filter-active-dot"]')).toBeNull();

    await using scopedScreen = await renderHeader({ isProjectScoped: true });
    expect(
      scopedScreen.container.querySelector('[data-testid="sidebar-filter-active-dot"]'),
    ).not.toBeNull();
  });

  it("renders grouped More menu actions and triggers Needs attention, Mark all read, and Collapse all sections", async () => {
    using _cleanup = resetSidebarRedesignState();
    const onNeedsAttentionOnlyChange = vi.fn();
    const onMarkAllRead = vi.fn();
    const onToggleCollapseAllSections = vi.fn();

    await using screen = await renderHeader({
      unreadCount: 4,
      needsAttentionOnly: false,
      anySectionExpanded: true,
      onNeedsAttentionOnlyChange,
      onMarkAllRead,
      onToggleCollapseAllSections,
    });

    await userEvent.click(screen.getByLabelText("More options"));

    await expect.element(page.getByText("Customize")).toBeVisible();
    await expect.element(page.getByText("Actions")).toBeVisible();
    await expect.element(page.getByText("Display options")).toBeVisible();
    await expect.element(page.getByText("By date")).toBeVisible();
    await expect.element(page.getByText("Edit tabs")).toBeVisible();
    await expect.element(page.getByText("1 pinned")).toBeVisible();
    await expect.element(page.getByText("Review old chats")).toBeVisible();
    await expect.element(page.getByText("Add project")).toBeVisible();

    const markRead = page.getByRole("menuitem", { name: /Mark all read/ });
    await expect.element(markRead).toBeVisible();
    await expect.element(page.getByText("4", { exact: true })).toBeVisible();
    await userEvent.click(markRead);
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByLabelText("More options"));
    const needsAttention = page.getByRole("menuitemcheckbox", { name: /Needs attention/ });
    await userEvent.click(needsAttention);
    expect(onNeedsAttentionOnlyChange).toHaveBeenCalledWith(true);

    const collapseAll = page.getByRole("menuitem", { name: "Collapse all sections" });
    await userEvent.click(collapseAll);
    expect(onToggleCollapseAllSections).toHaveBeenCalledTimes(1);
  });
});

describe("LeoSidebarDraftBlock and SidebarGroupHeading redesign", () => {
  it("renders collapsible Drafts section with compact draft rows and toggles visibility", async () => {
    using _cleanup = resetSidebarRedesignState();
    const envId = EnvironmentId.make("env-1");
    const projId = ProjectId.make("proj-1");
    const draftId1 = DraftId.make("draft-1");
    const draftId2 = DraftId.make("draft-2");

    useComposerDraftStore.setState({
      draftThreadsByThreadKey: {
        [draftId1]: {
          threadId: ThreadId.make("draft-thread-1"),
          environmentId: envId,
          projectId: projId,
          logicalProjectKey: `${envId}:${projId}`,
          branch: null,
          worktreePath: null,
          envMode: "local",
          startFromOrigin: false,
          runtimeMode: "full-access",
          interactionMode: "default",
          promotedTo: null,
          createdAt: "2026-11-19T10:00:00.000Z",
        },
        [draftId2]: {
          threadId: ThreadId.make("draft-thread-2"),
          environmentId: envId,
          projectId: projId,
          logicalProjectKey: `${envId}:${projId}`,
          branch: null,
          worktreePath: null,
          envMode: "local",
          startFromOrigin: false,
          runtimeMode: "full-access",
          interactionMode: "default",
          promotedTo: null,
          createdAt: "2026-11-19T11:00:00.000Z",
        },
      },
      draftsByThreadKey: {
        [draftId1]: {
          prompt: "Draft prompt one",
          images: [],
          nonPersistedImageIds: [],
          persistedAttachments: [],
          files: [],
          terminalContexts: [],
          previewAnnotations: [],
          reviewComments: [],
          threadContexts: [],
          modelSelectionByProvider: {},
          activeProvider: null,
          runtimeMode: null,
          interactionMode: null,
        },
        [draftId2]: {
          prompt: "Draft prompt two",
          images: [],
          nonPersistedImageIds: [],
          persistedAttachments: [],
          files: [],
          terminalContexts: [],
          previewAnnotations: [],
          reviewComments: [],
          threadContexts: [],
          modelSelectionByProvider: {},
          activeProvider: null,
          runtimeMode: null,
          interactionMode: null,
        },
      },
    });

    const projectByKey = new Map([
      [
        `${envId}:${projId}`,
        {
          id: projId,
          environmentId: envId,
          title: "Leonidas",
          workspaceRoot: "/repo",
          repositoryIdentity: null,
          defaultModelSelection: { instanceId: "claude" as never, model: "sonnet" },
          createdAt: "2026-11-19T00:00:00.000Z",
          updatedAt: "2026-11-19T00:00:00.000Z",
          scripts: [],
        },
      ],
    ]);
    const projectDisplayNameByKey = new Map([[`${envId}:${projId}`, "Leonidas"]]);

    function Harness() {
      const [expanded, setExpanded] = useState(true);
      const [groupExpanded, setGroupExpanded] = useState(true);
      return (
        <TooltipProvider delay={0}>
          <ul>
            <SidebarDraftBlock
              projectByKey={projectByKey}
              projectDisplayNameByKey={projectDisplayNameByKey}
              scopedProjectKeys={null}
              routeDraftId={draftId1}
              expanded={expanded}
              onToggleExpanded={() => setExpanded((v) => !v)}
              showProject
              onNavigateToDraft={() => {}}
              onDraftContextMenu={() => {}}
            />
            <SidebarGroupHeading
              id="today"
              label="Today"
              count={5}
              expanded={groupExpanded}
              onToggle={() => setGroupExpanded((v) => !v)}
            />
          </ul>
        </TooltipProvider>
      );
    }

    await using screen = await render(<Harness />);
    const draftsToggle = screen.container.querySelector<HTMLButtonElement>(
      '[data-testid="sidebar-drafts-shelf-toggle"]',
    )!;
    expect(draftsToggle).not.toBeNull();
    expect(draftsToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.container.querySelectorAll('[data-testid="sidebar-draft-row"]').length).toBe(2);

    // Collapsing keeps only the route-active draft row visible
    await act(async () => {
      draftsToggle.click();
    });
    expect(draftsToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.container.querySelectorAll('[data-testid="sidebar-draft-row"]').length).toBe(1);

    // Group heading toggles cleanly with aria-expanded
    const groupHeadingToggle = screen.getByRole("button", { name: /Today/ });
    await expect.element(groupHeadingToggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(groupHeadingToggle);
    await expect.element(groupHeadingToggle).toHaveAttribute("aria-expanded", "false");
  });
});

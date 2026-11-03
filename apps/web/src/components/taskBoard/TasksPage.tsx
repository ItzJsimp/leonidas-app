import {
  CircleCheckIcon,
  CloudUploadIcon,
  ColumnsIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  ListIcon,
  PlusIcon,
  RefreshCwIcon,
  RouteIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import { defaultDueForFocus } from "@t3tools/client-runtime/task-board/daily-planning";

import { WorkspacePageContainer } from "~/components/WorkspacePageContainer";
import { WorkspacePageHeader } from "~/components/WorkspacePageHeader";
import { Button } from "~/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { SidebarInset } from "~/components/ui/sidebar";
import { Spinner } from "~/components/ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { taskBoardCardCreate, workspaceOrgQuery } from "~/state/taskBoard";
import { privateAreaOptions } from "./privateArea.logic";

import { TaskCreateDialog } from "./TaskCreateDialog";
import { TaskDashboardView } from "./TaskDashboard";
import { TaskDetailPanel } from "./TaskDetail";
import { TaskFilterBar } from "./TaskFilterBar";
import { TaskKanbanView } from "./TaskKanban";
import { TaskPresenceProvider } from "./TaskPresence";
import { RoadmapEmpty } from "./TaskEmptyStates";
import { TaskListView } from "./TaskList";
import { TaskProjectRail, TaskProjectSelect } from "./TaskProjectRail";
import { useRailWidth } from "./TaskRailResizer";
import { AiosConfirmCard } from "./AiosConfirmCard";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { TaskQuickAdd } from "./TaskQuickAdd";
import { TaskRoadmapView } from "./TaskRoadmap";
import { OwnerLensPicker } from "./OwnerLensPicker";
import { isOpen } from "./taskBoard.logic";
import leonidasRoadmap from "../../../../../project-roadmap.json";
import type { TaskContext } from "./taskBoard.types";
import type { TaskView } from "./taskBoard.logic";
import {
  DEFAULT_TASKS_PREFS,
  TASKS_PREFS_KEY,
  activeFilterCount,
  landingPrefs,
  parseTasksPrefs,
  sectionShareState,
  tasksInFocus,
  type TaskFocus,
  type TasksPrefs,
  type TasksView,
} from "./tasksPage.logic";
import { PracticeDryRunDialog } from "./PracticeDryRunDialog";
import { PRACTICE_NAME, PRACTICE_SLUG } from "./practice.logic";
import { usePracticeActions } from "./usePracticeActions";
import { useTaskActions } from "./useTaskActions";
import { useTaskBoard } from "./useTaskBoard";

const VIEW_OPTIONS: ReadonlyArray<{
  readonly view: TasksView;
  readonly label: string;
  readonly icon: typeof ListIcon;
}> = [
  { view: "list", label: "Table", icon: ListIcon },
  { view: "board", label: "Board", icon: ColumnsIcon },
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { view: "roadmap", label: "Roadmap", icon: RouteIcon },
];

function readSavedPrefs(): TasksPrefs {
  try {
    return landingPrefs(parseTasksPrefs(window.localStorage.getItem(TASKS_PREFS_KEY)));
  } catch {
    return landingPrefs(DEFAULT_TASKS_PREFS);
  }
}

/** The Tasks route: the user's AIOS task cards, sectioned by project, with shared project boards. */
/**
 * Where the selected project stands with collaborators. Open team cards sync on their own about
 * once a minute; "Sync now" pushes them at once.
 */
function SyncStatus(props: {
  readonly state: ReturnType<typeof sectionShareState>;
  readonly canSync: boolean;
  readonly busy: boolean;
  readonly onSync: () => void;
}) {
  const { state } = props;
  if (state.kind === "hidden") return null;
  if (state.kind === "unavailable") {
    return (
      <Tooltip>
        <TooltipTrigger render={<span className="text-xs text-muted-foreground" />}>
          Only on this machine
        </TooltipTrigger>
        <TooltipPopup>{state.reason}</TooltipPopup>
      </Tooltip>
    );
  }
  if (state.kind === "shared") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <CircleCheckIcon aria-hidden className="size-3.5 text-success-foreground" />
        Synced with collaborators
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {state.count} {state.count === 1 ? "task" : "tasks"} waiting to sync
      </span>
      {props.canSync ? (
        <Button size="compact" variant="outline" disabled={props.busy} onClick={props.onSync}>
          <CloudUploadIcon aria-hidden />
          Sync now
        </Button>
      ) : null}
    </span>
  );
}

export function TasksPage() {
  const [prefs, setPrefs] = useState<TasksPrefs>(readSavedPrefs);
  const { width: railWidth, handle: railHandle } = useRailWidth();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const practice = usePracticeActions();
  const inPractice = prefs.section === PRACTICE_SLUG;
  // A workspace file names the AIOS folder, so the old folder prompt is only for setups without one.
  const { active: activeWorkspace, scope, scopeReady } = useActiveAiosWorkspace();
  const orgEnvironmentId = usePrimaryEnvironmentId();
  const org = useEnvironmentQuery(
    orgEnvironmentId && scopeReady
      ? workspaceOrgQuery({ environmentId: orgEnvironmentId, input: scope })
      : null,
  ).data?.org;
  const areas = useMemo(() => privateAreaOptions(org?.areas ?? []), [org]);
  const board = useTaskBoard({
    selectedSlug: prefs.section,
    prefs,
    query,
    practiceTasks: practice.tasks,
  });
  const canCreate = useAtomValue(taskBoardCardCreate.permissionAtom(board.environmentId));
  const {
    actions: realActions,
    shareSection,
    isSharingSection,
  } = useTaskActions({
    environmentId: board.environmentId,
    member: board.member,
    aiosRoot: board.aiosRoot,
    projects: board.projects,
    selectedSlug: prefs.section,
    refresh: board.refresh,
  });

  const actions = inPractice ? practice.actions : realActions;

  useEffect(() => {
    try {
      window.localStorage.setItem(TASKS_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Preferences are a convenience; a full or blocked store must not break the page.
    }
  }, [prefs]);

  const patchPrefs = useCallback((patch: Partial<TasksPrefs>) => {
    setPrefs((current) => ({ ...current, ...patch }));
  }, []);
  // "/" jumps to search from anywhere on the page, the way most list apps do.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      if (event.target.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      event.preventDefault();
      setPrefs((current) =>
        current.view === "list" || current.view === "board"
          ? current
          : { ...current, view: "list" },
      );
      // From Dashboard or Roadmap the search box mounts a frame or two later.
      const focusSearch = (tries: number) => {
        const input = document.querySelector<HTMLInputElement>("[data-tasks-search]");
        if (input) input.focus();
        else if (tries > 0) requestAnimationFrame(() => focusSearch(tries - 1));
      };
      requestAnimationFrame(() => focusSearch(5));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const selectSection = useCallback(
    (slug: string | null) => {
      patchPrefs({ section: slug, focus: "all" });
      setSelectedId(null);
    },
    [patchPrefs],
  );
  const selectFocus = useCallback(
    (focus: TaskFocus) => {
      patchPrefs({ ...DEFAULT_TASKS_PREFS, focus, section: null, sort: "due", groupBy: "none" });
      setQuery("");
      setSelectedId(null);
    },
    [patchPrefs],
  );
  const selectTask = useCallback((task: TaskView) => setSelectedId(task.id), []);
  const closeDetail = useCallback(() => setSelectedId(null), []);

  const context = useMemo<TaskContext>(
    () => ({
      member: board.member,
      viewer: board.viewer,
      team: board.team,
      now: board.now,
      aiosRoot: board.aiosRoot,
      projects: board.projects,
      areas,
    }),
    [board.aiosRoot, board.member, board.viewer, board.team, board.now, board.projects, areas],
  );

  const selectedTask = selectedId
    ? (board.allTasks.find((task) => task.id === selectedId) ?? null)
    : null;
  const rail = useMemo(
    () => [
      ...board.rail,
      {
        slug: PRACTICE_SLUG,
        name: PRACTICE_NAME,
        projectId: null,
        repository: null,
        open: practice.tasks.filter((task) => task.status !== "done").length,
        total: practice.tasks.length,
      },
    ],
    [board.rail, practice.tasks],
  );
  const railEntry = prefs.section
    ? (rail.find((entry) => entry.slug === prefs.section) ?? null)
    : null;
  const roadmapSlug = prefs.section ?? "leonidas-code";
  const roadmap =
    board.roadmaps.find((plan) => plan.projectSlug === roadmapSlug) ??
    (roadmapSlug === "leonidas-code" ? leonidasRoadmap : null);
  const shareState = inPractice
    ? ({ kind: "hidden" } as const)
    : sectionShareState(railEntry, board.scopedTasks);
  const allOpen = board.rail.reduce((sum, entry) => sum + entry.open, 0);
  const counts = useMemo(
    () => ({
      inbox: tasksInFocus(board.backlogTasks, "inbox", board.now).length,
      today: tasksInFocus(board.backlogTasks, "today", board.now).length,
      upcoming: tasksInFocus(board.backlogTasks, "upcoming", board.now).length,
    }),
    [board.backlogTasks, board.now],
  );
  const searching = query.trim().length > 0 && (prefs.view === "list" || prefs.view === "board");
  const heading =
    prefs.view === "roadmap"
      ? `${roadmap?.name ?? railEntry?.name ?? "Project"} roadmap`
      : searching
        ? "Search"
        : prefs.focus === "inbox"
          ? "Inbox"
          : prefs.focus === "today"
            ? "Today"
            : prefs.focus === "upcoming"
              ? "Upcoming"
              : (railEntry?.name ?? "All tasks");
  const openInLens = board.scopedTasks.filter(isOpen).length;
  const changeView = (view: TasksView) => {
    patchPrefs(
      view === "roadmap"
        ? { view, focus: "all", section: prefs.section ?? "leonidas-code" }
        : { view },
    );
    setSelectedId(null);
  };
  const defaultDue =
    prefs.focus === "all" ? "" : (defaultDueForFocus(prefs.focus, board.now) ?? "");

  const picker = (
    <div className="@4xl/tasks:hidden">
      <TaskProjectSelect
        entries={rail}
        selectedSlug={prefs.section}
        onSelect={selectSection}
        focus={prefs.focus}
        onFocus={selectFocus}
      />
    </div>
  );

  const clearFilters =
    activeFilterCount(prefs, query) > 0
      ? () => {
          setQuery("");
          patchPrefs({ statuses: null, priorities: null, sharedOnly: false });
        }
      : null;

  let body;
  if (board.isLoading && !inPractice) {
    body = (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  } else if (board.error !== null && board.allTasks.length === 0 && !inPractice) {
    body = (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Tasks could not be loaded</EmptyTitle>
          <EmptyDescription>{board.error}</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onClick={board.refresh}>
          Try again
        </Button>
      </Empty>
    );
  } else if (prefs.view === "roadmap") {
    body = roadmap ? (
      <TaskRoadmapView
        key={`${board.environmentId}:${roadmap.projectSlug}`}
        plan={roadmap}
        tasks={board.allTasks}
        environmentId={board.environmentId}
        member={board.member}
        actions={actions}
        onSelect={selectTask}
        onRefresh={board.refresh}
      />
    ) : (
      <RoadmapEmpty name={railEntry?.name ?? roadmapSlug} slug={roadmapSlug} />
    );
  } else if (prefs.view === "dashboard") {
    body = (
      <TaskDashboardView
        dashboard={board.dashboard}
        tasks={board.scopedTasks}
        context={context}
        actions={actions}
        onSelect={selectTask}
        onOpenSection={selectSection}
        onCreate={() => setCreateOpen(true)}
      />
    );
  } else if (prefs.view === "board") {
    body = (
      <TaskKanbanView
        tasks={board.visibleTasks}
        context={context}
        actions={actions}
        selectedId={selectedId}
        onSelect={selectTask}
        onClearFilters={clearFilters}
      />
    );
  } else {
    body = (
      <TaskListView
        tasks={board.visibleTasks}
        sections={board.sections}
        groupBy={prefs.groupBy}
        context={context}
        actions={actions}
        selectedId={selectedId}
        onSelect={selectTask}
        onClearFilters={clearFilters}
      />
    );
  }

  return (
    <TaskPresenceProvider tasks={board.allTasks}>
      <SidebarInset
        data-tasks-surface
        // Breakpoints follow the pane, not the window: in the split the pane is half the width.
        className="@container/tasks isolate h-dvh min-h-0 overflow-hidden overscroll-y-none"
      >
        <WorkspacePageHeader electron={isElectron} className="gap-2 border-b border-border">
          <ListChecksIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate text-sm font-medium">Tasks</h1>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh tasks"
              onClick={board.refresh}
              disabled={board.isRefreshing}
            >
              <RefreshCwIcon
                aria-hidden
                className={board.isRefreshing ? "animate-spin" : undefined}
              />
            </Button>
            <Button
              aria-label="New task"
              size="sm"
              onClick={() => setCreateOpen(true)}
              disabled={!board.environmentId || !canCreate || inPractice}
            >
              <PlusIcon aria-hidden />
              <span className="hidden sm:inline">New task</span>
            </Button>
          </div>
        </WorkspacePageHeader>

        <div className="flex min-h-0 flex-1">
          <aside
            style={{ width: railWidth }}
            className="hidden shrink-0 overflow-y-auto p-2 @4xl/tasks:block"
          >
            <TaskProjectRail
              entries={rail}
              allOpen={allOpen}
              selectedSlug={prefs.section}
              onSelect={selectSection}
              focus={prefs.focus}
              counts={counts}
              onFocus={selectFocus}
            />
          </aside>
          {railHandle}

          <div
            className={
              selectedTask
                ? "hidden min-h-0 min-w-0 flex-1 flex-col @4xl/tasks:flex"
                : "flex min-h-0 min-w-0 flex-1 flex-col"
            }
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-2">
              <div className="flex min-w-0 items-baseline gap-2">
                <h2 className="truncate text-lg font-semibold">{heading}</h2>
                {prefs.view !== "roadmap" ? (
                  <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                    {searching ? `${board.visibleTasks.length} found` : `${openInLens} open`}
                  </span>
                ) : null}
              </div>
              <div
                role="tablist"
                aria-label="View"
                className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
              >
                {VIEW_OPTIONS.map(({ view, label, icon: Icon }) => (
                  <button
                    key={view}
                    type="button"
                    role="tab"
                    aria-selected={prefs.view === view}
                    aria-label={label}
                    data-tour={view === "roadmap" ? "tasks-roadmap-tab" : undefined}
                    onClick={() => changeView(view)}
                    className={cn(
                      "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      prefs.view === view
                        ? "bg-background font-medium text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon aria-hidden className="size-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
              <div className="ml-auto flex min-w-0 flex-1 basis-64 flex-wrap items-center justify-end gap-1">
                {prefs.view !== "roadmap" ? (
                  <OwnerLensPicker
                    options={board.ownerOptions}
                    value={prefs.owner}
                    onChange={(owner) => {
                      patchPrefs({ owner });
                      setSelectedId(null);
                    }}
                  />
                ) : null}
                {prefs.view === "list" || prefs.view === "board" ? (
                  <TaskFilterBar
                    prefs={prefs}
                    query={query}
                    onQueryChange={setQuery}
                    onPrefsChange={patchPrefs}
                    showGroupBy={prefs.view === "list"}
                    showClosedToggle={prefs.view === "list"}
                    leading={picker}
                  />
                ) : (
                  picker
                )}
                <SyncStatus
                  state={shareState}
                  canSync={Boolean(railEntry?.projectId)}
                  busy={isSharingSection}
                  onSync={() => {
                    if (railEntry?.projectId) shareSection(railEntry.projectId);
                  }}
                />
              </div>
            </div>
            {activeWorkspace ? null : (
              <AiosConfirmCard environmentId={board.environmentId} onConfirmed={board.refresh} />
            )}
            {inPractice ? (
              <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  Practice project: sample tasks to try things on. Nothing here touches your real
                  tasks, GitHub or AI.
                </span>
                <Button size="sm" variant="outline" onClick={practice.reset}>
                  Reset
                </Button>
              </div>
            ) : null}
            {(prefs.view === "list" || prefs.view === "board") && !inPractice ? (
              <TaskQuickAdd
                key={`${prefs.section}:${prefs.focus}`}
                environmentId={board.environmentId}
                member={board.member}
                projectSlug={prefs.section === "general" ? null : prefs.section}
                defaultDue={defaultDue}
                onCreated={board.refresh}
              />
            ) : null}

            {board.sharedError ? (
              <p
                role="status"
                className="border-b border-border px-3 py-2 text-xs text-warning-foreground"
              >
                The shared board could not be read, so only the tasks on this computer show.
              </p>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {prefs.view === "dashboard" ? (
                <WorkspacePageContainer width="wide">{body}</WorkspacePageContainer>
              ) : (
                body
              )}
            </div>
          </div>

          {selectedTask ? (
            <aside
              aria-label="Task details"
              className="flex min-h-0 w-full shrink-0 flex-col overflow-y-auto border-l border-border @4xl/tasks:w-[26rem]"
            >
              <TaskDetailPanel
                task={selectedTask}
                context={context}
                actions={actions}
                onClose={closeDetail}
              />
            </aside>
          ) : null}
        </div>

        <PracticeDryRunDialog
          dryRun={practice.dryRun}
          onClose={practice.closeDryRun}
          onFinish={practice.finishDryRun}
        />
        <TaskCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          environmentId={board.environmentId}
          member={board.member}
          projects={board.projects}
          defaultSlug={prefs.section}
          onCreated={board.refresh}
        />
      </SidebarInset>
    </TaskPresenceProvider>
  );
}

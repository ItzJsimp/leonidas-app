import type { TaskSchemaProperty } from "@t3tools/contracts";
import {
  CircleCheckIcon,
  CloudUploadIcon,
  ColumnsIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  ListIcon,
  TableIcon,
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
import { taskBoardCardCreate, taskSchemaQuery, workspaceOrgQuery } from "~/state/taskBoard";
import { privateAreaOptions } from "./privateArea.logic";

import { TaskCreateDialog } from "./TaskCreateDialog";
import { TaskDashboardView } from "./TaskDashboard";
import { useHiddenProjects } from "./useHiddenProjects";
import { useFocusShortcut } from "./useFocusShortcut";
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
import { isOpen, statusLabel } from "./taskBoard.logic";
import leonidasRoadmap from "../../../../../project-roadmap.json";
import type { TaskContext } from "./taskBoard.types";
import type { TaskView } from "./taskBoard.logic";
import {
  DEFAULT_TASKS_PREFS,
  TASKS_PREFS_KEY,
  activeFilterCount,
  landingPrefs,
  parseTasksPrefs,
  prefsForList,
  type FocusList,
  sectionShareState,
  tasksInFocus,
  type TaskFocus,
  type TasksPrefs,
  type TasksView,
} from "./tasksPage.logic";
import { PracticeDryRunDialog } from "./PracticeDryRunDialog";
import { PRACTICE_NAME, PRACTICE_SLUG } from "./practice.logic";
import { usePracticeActions } from "./usePracticeActions";
import { shortTitle, useTaskActions } from "./useTaskActions";
import { useTaskUndo } from "./useTaskUndo";
import { useTasksLayout } from "./useTasksLayout";
import { TaskTableView } from "./TaskTable";
import { TaskPropertiesMenu } from "./TaskPropertiesMenu";
import type { LayoutChange } from "./TaskTableHeader";
import { moveRank, pruneRanks, type TasksLayout } from "./taskLayout.logic";
import type { RowMovePlan } from "./taskRows";
import type { PendingEdit } from "./taskUndo.logic";

const NO_PENDING: ReadonlyMap<string, PendingEdit> = new Map();
const NO_SCHEMA: ReadonlyArray<TaskSchemaProperty> = [];
import { useTaskBoard } from "./useTaskBoard";

const VIEW_OPTIONS: ReadonlyArray<{
  readonly view: TasksView;
  readonly label: string;
  readonly icon: typeof ListIcon;
}> = [
  { view: "table", label: "Table", icon: TableIcon },
  { view: "board", label: "Board", icon: ColumnsIcon },
  { view: "list", label: "List", icon: ListIcon },
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
          Tasks not shared
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
  const [pending, setPending] = useState<ReadonlyMap<string, PendingEdit>>(NO_PENDING);
  const board = useTaskBoard({
    selectedSlug: prefs.section,
    prefs,
    query,
    practiceTasks: practice.tasks,
    pending,
  });
  const schema =
    useEnvironmentQuery(
      board.environmentId && scopeReady
        ? taskSchemaQuery({ environmentId: board.environmentId, input: scope })
        : null,
    ).data?.properties ?? NO_SCHEMA;
  const undo = useTaskUndo();
  const tasksLayout = useTasksLayout();
  const { update: updateLayout } = tasksLayout;
  // Every layout change is one undo step that puts back only the parts it changed (the columns,
  // the row order, or both), so undoing a row move keeps a later column change.
  const changeLayout = useCallback<LayoutChange>(
    (label, change, options) => {
      let before: TasksLayout | null = null;
      let after: TasksLayout | null = null;
      updateLayout((current) => {
        const next = change(current);
        before = current;
        after = next;
        return next;
      });
      const [from, to] = [before as TasksLayout | null, after as TasksLayout | null];
      if (!from || !to) return;
      const changed = (layout: TasksLayout): Partial<TasksLayout> => ({
        ...(from.table !== to.table ? { table: layout.table } : {}),
        ...(from.ranks !== to.ranks ? { ranks: layout.ranks } : {}),
      });
      const [old, next] = [changed(from), changed(to)];
      if (Object.keys(old).length === 0) return;
      undo.record(
        label,
        {
          undo: async () => (updateLayout((current) => ({ ...current, ...old })), true),
          redo: async () => (updateLayout((current) => ({ ...current, ...next })), true),
        },
        options,
      );
    },
    [undo, updateLayout],
  );
  const listLike = prefs.view === "table" || prefs.view === "list";
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
    tasks: board.allTasks,
    undo,
    setPending,
  });

  const actions = inPractice ? practice.actions : realActions;
  const live = useMemo(() => new Set(board.allTasks.map((task) => task.id)), [board.allTasks]);
  // A move is one undo step: the new row order and, for a drop in another group, the card change.
  const moveRow = useCallback(
    (task: TaskView, plan: RowMovePlan) => {
      const { patch } = plan;
      const place =
        patch === null
          ? null
          : "status" in patch
            ? statusLabel(patch.status)
            : (board.projects.find((project) => project.slug === patch.projectSlug)?.name ??
              patch.projectSlug ??
              "No project");
      const label = `${place ? `Moved to ${place}` : "Moved"}: ${shortTitle(task)}`;
      undo.group(label, () => {
        if (patch && "status" in patch) realActions.setStatus(task, patch.status);
        else if (patch) realActions.linkProject(task, patch.projectSlug);
        changeLayout(label, (layout) => ({
          ...layout,
          ranks: pruneRanks(moveRank(layout.ranks, plan.orderedIds, task.id, plan.index), live),
        }));
      });
    },
    [board.projects, changeLayout, live, realActions, undo],
  );

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
  // Search and quick add live in the Table and Board views.
  const showListView = useCallback(
    () =>
      setPrefs((current) =>
        current.view === "table" || current.view === "list" || current.view === "board"
          ? current
          : { ...current, view: "table" },
      ),
    [],
  );
  useFocusShortcut("/", "[data-tasks-search]", showListView);
  useFocusShortcut("n", "[data-tasks-quick-add]", showListView);
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
  const openList = useCallback(
    (list: FocusList) => {
      setQuery("");
      patchPrefs(prefsForList(list));
    },
    [patchPrefs],
  );
  const { hidden, setHidden } = useHiddenProjects();
  const hiddenProjects = { hidden, onHide: setHidden };
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
  const roadmapSlug = prefs.section ?? "leonidas-code";
  const roadmap =
    board.roadmaps.find((plan) => plan.projectSlug === roadmapSlug) ??
    (roadmapSlug === "leonidas-code" ? leonidasRoadmap : null);
  // A roadmap's project with no tasks still gets a rail row, so the scope shows as selected.
  const roadmapOnly =
    prefs.view === "roadmap" && roadmap && !board.rail.some((entry) => entry.slug === roadmapSlug)
      ? roadmap.name
      : null;
  const rail = useMemo(
    () => [
      ...board.rail,
      ...(roadmapOnly
        ? [
            {
              slug: roadmapSlug,
              name: roadmapOnly,
              projectId: null,
              repository: null,
              open: 0,
              total: 0,
            },
          ]
        : []),
      {
        slug: PRACTICE_SLUG,
        name: PRACTICE_NAME,
        projectId: null,
        repository: null,
        open: practice.tasks.filter((task) => task.status !== "done").length,
        total: practice.tasks.length,
      },
    ],
    [board.rail, practice.tasks, roadmapOnly, roadmapSlug],
  );
  const railEntry = prefs.section
    ? (rail.find((entry) => entry.slug === prefs.section) ?? null)
    : null;
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
  const searching = query.trim().length > 0 && (listLike || prefs.view === "board");
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
          patchPrefs({ statuses: null, priorities: null, sharedOnly: false, flag: null });
        }
      : null;
  const empty = {
    query: searching ? query.trim() : "",
    onClearFilters: clearFilters,
    inbox: prefs.focus === "inbox" ? { open: allOpen, onShowAll: () => selectFocus("all") } : null,
  };

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
        onOpenList={openList}
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
        empty={empty}
      />
    );
  } else if (prefs.view === "list") {
    body = (
      <TaskListView
        tasks={board.visibleTasks}
        sections={board.sections}
        // Search hits show as one flat list so none hide inside a folded group.
        groupBy={prefs.groupBy === "state" && query.trim() ? "none" : prefs.groupBy}
        context={context}
        actions={actions}
        selectedId={selectedId}
        onSelect={selectTask}
        empty={empty}
      />
    );
  } else {
    body = (
      <TaskTableView
        tasks={board.visibleTasks}
        sections={board.sections}
        groupBy={prefs.groupBy === "state" && query.trim() ? "none" : prefs.groupBy}
        layout={tasksLayout.layout}
        onLayoutChange={changeLayout}
        onMoveRow={inPractice ? undefined : moveRow}
        schema={schema}
        context={context}
        actions={actions}
        selectedId={selectedId}
        onSelect={selectTask}
        empty={empty}
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
          {/* An open task takes the rail's width until the pane is wide, so the list keeps room. */}
          <div
            className={cn(
              "hidden min-h-0 shrink-0",
              selectedTask ? "@7xl/tasks:flex" : "@4xl/tasks:flex",
            )}
          >
            <aside style={{ width: railWidth }} className="overflow-y-auto p-2">
              <TaskProjectRail
                entries={rail}
                allOpen={allOpen}
                selectedSlug={prefs.section}
                onSelect={selectSection}
                focus={prefs.focus}
                counts={counts}
                onFocus={selectFocus}
                {...hiddenProjects}
              />
            </aside>
            {railHandle}
          </div>

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
              {/* Narrow panes: the two scope selects share a row, and search gets the next one. */}
              <div className="ml-auto flex min-w-0 flex-1 basis-64 flex-wrap items-center justify-start gap-1 @4xl/tasks:justify-end">
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
                {picker}
                {prefs.view === "table" ? (
                  <TaskPropertiesMenu layout={tasksLayout.layout} onLayoutChange={changeLayout} />
                ) : null}
                {listLike || prefs.view === "board" ? (
                  <TaskFilterBar
                    prefs={prefs}
                    query={query}
                    onQueryChange={setQuery}
                    onPrefsChange={patchPrefs}
                    showGroupBy={listLike}
                    showClosedToggle={listLike}
                  />
                ) : null}
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
            {(listLike || prefs.view === "board") && !inPractice ? (
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

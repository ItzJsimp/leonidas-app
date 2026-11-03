import type {
  EnvironmentId,
  ProjectId,
  TaskBoardTask,
  TaskBoardTeamMember,
  TaskBoardWorkspaceProject,
} from "@t3tools/contracts";
import { useCallback, useMemo, useState } from "react";

import { useVisibleInterval } from "~/hooks/useVisibleInterval";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { taskBoardWorkspaceQuery } from "~/state/taskBoard";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { PRACTICE_SLUG } from "./practice.logic";
import { useSharedBoards } from "./useSharedBoards";
import {
  canonicalName,
  isAgentRun,
  matchesOwnerLens,
  ownerLensOptions,
  type OwnerLensOption,
} from "./owner.logic";
import type { RoadmapPlan } from "./taskRoadmap.logic";

import {
  buildDashboard,
  filterTasks,
  groupBySection,
  isOpen,
  mergeTasks,
  sortTasks,
  type TaskDashboard,
  type TaskSectionGroup,
  type TaskView,
} from "./taskBoard.logic";
import {
  buildRailEntries,
  openFirst,
  searchBase,
  tasksInSection,
  tasksInFocus,
  toTaskFilters,
  type RailEntry,
  type TasksPrefs,
} from "./tasksPage.logic";

/** The AIOS cards re-read this often while the page is showing. */
const WORKSPACE_REFRESH_MS = 5_000;
/** The GitHub-backed shared board costs a network round trip, so it is read less often. */
const SHARED_REFRESH_MS = 30_000;

const NO_PROJECTS: ReadonlyArray<TaskBoardWorkspaceProject> = [];
const NO_TEAM: ReadonlyArray<TaskBoardTeamMember> = [];

export type TaskBoardState = {
  readonly environmentId: EnvironmentId | null;
  readonly member: string;
  /** The viewer as the team knows them ("Jake" for the login "ItzJsimp"). */
  readonly viewer: string;
  readonly team: ReadonlyArray<TaskBoardTeamMember>;
  readonly aiosRoot: string | null;
  /** False once the server has answered and found no AIOS task folder. */
  readonly aiosConnected: boolean;
  readonly projects: ReadonlyArray<TaskBoardWorkspaceProject>;
  readonly roadmaps: ReadonlyArray<RoadmapPlan>;
  /** Every task, merged with the selected project's shared board. */
  readonly allTasks: ReadonlyArray<TaskView>;
  /** Every task except agent-run records: what the rail and daily counts measure. */
  readonly backlogTasks: ReadonlyArray<TaskView>;
  /** The owner lenses for the selected section, with open counts. */
  readonly ownerOptions: ReadonlyArray<OwnerLensOption>;
  /** The tasks in the selected section and owner lens, before the toolbar filters. */
  readonly scopedTasks: ReadonlyArray<TaskView>;
  /** The selected section's tasks after filters and sorting. */
  readonly visibleTasks: ReadonlyArray<TaskView>;
  readonly sections: TaskSectionGroup[];
  readonly rail: RailEntry[];
  readonly dashboard: TaskDashboard;
  readonly now: number;
  /** True until the first answer arrives. */
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly error: string | null;
  /** Set when the shared board could not be read; local cards still show. */
  readonly sharedError: string | null;
  readonly refresh: () => void;
};

/**
 * Reads the AIOS task cards for the primary environment, plus the shared board of the selected
 * project, and derives everything the Tasks page shows from them. Refreshes only while the window
 * is showing.
 */
export function useTaskBoard(input: {
  readonly selectedSlug: string | null;
  readonly prefs: TasksPrefs;
  readonly query: string;
  /** Sample tasks shown instead of the real ones while the practice project is selected. */
  readonly practiceTasks?: ReadonlyArray<TaskBoardTask>;
}): TaskBoardState {
  const { selectedSlug, prefs, query, practiceTasks } = input;
  const environmentId = usePrimaryEnvironmentId();
  const { scope, scopeReady } = useActiveAiosWorkspace();
  const workspace = useEnvironmentQuery(
    environmentId && scopeReady ? taskBoardWorkspaceQuery({ environmentId, input: scope }) : null,
  );
  const data = workspace.data;
  const projects = data?.projects ?? NO_PROJECTS;
  const team = data?.team ?? NO_TEAM;
  // Actions sign with the raw member name so existing claims still match; views use the team name.
  const member = data?.member ?? "Unknown";
  const viewer = canonicalName(member, team) ?? member;

  // Every repository-backed project's shared board is read, selected or not, so a project a
  // collaborator shares (a shared Leonidas Code repo) shows up on its own.
  const localCards = data?.tasks;
  const sharedTargets = useMemo(() => {
    // Projects can point at one repository (a sub-folder and its parent); its board is read
    // once, for the project that owns the most local cards, so it never shows up twice.
    const cardsFor = (slug: string) =>
      (localCards ?? []).filter((task) => task.projectSlug === slug).length;
    const byRepository = new Map<string, { slug: string; projectId: ProjectId }>();
    for (const project of projects) {
      if (!project.projectId || !project.repository) continue;
      const chosen = byRepository.get(project.repository);
      if (!chosen || cardsFor(project.slug) > cardsFor(chosen.slug)) {
        byRepository.set(project.repository, { slug: project.slug, projectId: project.projectId });
      }
    }
    return [...byRepository.values()];
  }, [localCards, projects]);
  const shared = useSharedBoards(environmentId, sharedTargets);

  const { refresh: refreshWorkspace } = workspace;
  const { refresh: refreshShared } = shared;
  const hasSharedBoards = sharedTargets.length > 0;
  const refresh = useCallback(() => {
    refreshWorkspace();
    if (hasSharedBoards) refreshShared();
  }, [hasSharedBoards, refreshShared, refreshWorkspace]);

  useVisibleInterval(refreshWorkspace, WORKSPACE_REFRESH_MS, environmentId !== null);
  useVisibleInterval(refreshShared, SHARED_REFRESH_MS, hasSharedBoards);

  const sharedTasks = shared.tasks;
  const realTasks = useMemo(
    () => mergeTasks(data?.tasks ?? [], sharedTasks),
    [data?.tasks, sharedTasks],
  );
  const allTasks = useMemo(
    () =>
      practiceTasks && selectedSlug === PRACTICE_SLUG ? mergeTasks(practiceTasks, []) : realTasks,
    [practiceTasks, realTasks, selectedSlug],
  );

  // The page's clock moves with each answer from the server rather than on its own timer.
  const [openedAt] = useState(() => Date.now());
  const now = workspace.dataUpdatedAt || openedAt;

  const backlogTasks = useMemo(() => allTasks.filter((task) => !isAgentRun(task)), [allTasks]);
  const focusedTasks = useMemo(
    () =>
      tasksInFocus(
        tasksInSection(allTasks, selectedSlug),
        prefs.focus,
        now,
        prefs.includeClosed || prefs.view === "board",
      ),
    [allTasks, selectedSlug, prefs.focus, prefs.includeClosed, prefs.view, now],
  );
  const ownerOptions = useMemo(
    () => ownerLensOptions(focusedTasks.filter(isOpen), viewer, team),
    [focusedTasks, viewer, team],
  );
  const scopedTasks = useMemo(
    () => focusedTasks.filter((task) => matchesOwnerLens(task, prefs.owner, viewer, team)),
    [focusedTasks, prefs.owner, viewer, team],
  );
  const visibleTasks = useMemo(() => {
    const found = sortTasks(
      filterTasks(searchBase(allTasks, scopedTasks, query), toTaskFilters(prefs, query)),
      prefs.sort,
    );
    return query.trim() ? openFirst(found) : found;
  }, [allTasks, prefs, query, scopedTasks]);
  const sections = useMemo(
    () => groupBySection(visibleTasks, projects, { hideEmpty: true }),
    [projects, visibleTasks],
  );
  const rail = useMemo(() => buildRailEntries(realTasks, projects), [realTasks, projects]);
  const dashboard = useMemo(
    () => buildDashboard(scopedTasks, now, viewer, team),
    [viewer, now, scopedTasks, team],
  );

  return {
    environmentId,
    member,
    viewer,
    team,
    aiosRoot: data?.aiosRoot ?? null,
    aiosConnected: data?.aiosConnected ?? true,
    projects,
    roadmaps: data?.roadmaps ?? [],
    allTasks,
    backlogTasks,
    ownerOptions,
    scopedTasks,
    visibleTasks,
    sections,
    rail,
    dashboard,
    now,
    isLoading: environmentId !== null && data === null && workspace.error === null,
    isRefreshing: workspace.isPending || shared.isPending,
    error: workspace.error,
    sharedError: shared.error,
    refresh,
  };
}

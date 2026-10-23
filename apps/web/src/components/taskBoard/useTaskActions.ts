import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import {
  type EnvironmentId,
  type ProjectId,
  type ThreadId,
  type TaskBoardCardUpdateInput,
  type TaskBoardWorkspaceProject,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useAtomValue } from "@effect/atom-react";

import { useComposerDraftStore } from "~/composerDraftStore";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { readProjects, readThreadShell, useProjects } from "~/state/entities";
import { taskBoardCardUpdate, taskBoardShare } from "~/state/taskBoard";
import { workspaceScopeInput } from "~/components/workspace/aiosWorkspace.logic";
import { activeWorkspaceId } from "~/components/workspace/aiosWorkspaceStore";
import { useAtomCommand } from "~/state/use-atom-command";
import { buildThreadRouteParams } from "~/threadRoutes";
import { toastManager } from "~/components/ui/toast";

import {
  buildBatchPrompt,
  buildTaskPrompt,
  type TaskView,
  type TriageSuggestion,
} from "./taskBoard.logic";
import type { TaskActions } from "./taskBoard.types";
import { claimPatch, failureText, pickLaunchProject, planSend } from "./useTaskActions.logic";

type CardPatch = Omit<TaskBoardCardUpdateInput, "taskId" | "projectId" | "actor">;

export type UseTaskActionsInput = {
  readonly environmentId: EnvironmentId | null;
  /** The signed-in member that every change is recorded against. */
  readonly member: string;
  readonly aiosRoot: string | null;
  readonly projects: ReadonlyArray<TaskBoardWorkspaceProject>;
  /** The project section selected on the page; the fallback project for sending to an agent. */
  readonly selectedSlug: string | null;
  /** Re-reads the task queries; called after every command settles. */
  readonly refresh: () => void;
};

export type UseTaskActionsResult = {
  readonly actions: TaskActions;
  /** Publishes every open card linked to the project to its shared board. */
  readonly shareSection: (projectId: ProjectId) => void;
  readonly isSharingSection: boolean;
};

/**
 * Implements the mutations the Tasks views trigger. Every call is fire and forget: failures
 * surface as a toast and the queries refresh once the command settles, so the views never hold
 * optimistic state.
 */
export function useTaskActions(input: UseTaskActionsInput): UseTaskActionsResult {
  const { environmentId, projects: sections } = input;
  const navigate = useNavigate();
  const environmentProjects = useProjects();
  const runCardUpdate = useAtomCommand(taskBoardCardUpdate, { reportFailure: false });
  const canEdit = useAtomValue(taskBoardCardUpdate.permissionAtom(environmentId));
  const runShare = useAtomCommand(taskBoardShare, { reportFailure: false });
  const handleNewThread = useNewThreadHandler();
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [isSharingSection, setSharingSection] = useState(false);

  const hasLaunchProject = useMemo(
    () => environmentProjects.some((project) => project.environmentId === environmentId),
    [environmentId, environmentProjects],
  );

  // Handlers read the latest props through this ref so their identity never changes.
  const latest = useRef({ input, runCardUpdate, runShare, handleNewThread, navigate });
  latest.current = { input, runCardUpdate, runShare, handleNewThread, navigate };

  const report = useCallback((title: string, description: string) => {
    toastManager.add({ type: "error", title, description });
  }, []);

  const reportResult = useCallback(
    (result: AtomCommandResult<unknown, unknown>, title: string): boolean => {
      if (result._tag === "Success") return true;
      if (!isAtomCommandInterrupted(result)) {
        report(title, failureText(squashAtomCommandFailure(result), "Please try again."));
      }
      return false;
    },
    [report],
  );

  const sectionProjectId = useCallback((task: TaskView): ProjectId | null => {
    const { projects } = latest.current.input;
    return projects.find((project) => project.slug === task.section)?.projectId ?? null;
  }, []);

  const track = useCallback(
    async (taskIds: string | ReadonlyArray<string>, work: () => Promise<void>) => {
      const ids = typeof taskIds === "string" ? [taskIds] : taskIds;
      setBusy((current) => new Set([...current, ...ids]));
      try {
        await work();
      } finally {
        setBusy((current) => {
          const next = new Set(current);
          for (const id of ids) next.delete(id);
          return next;
        });
        latest.current.input.refresh();
      }
    },
    [],
  );

  const updateCard = useCallback(
    (task: TaskView, patch: CardPatch, failureTitle: string) => {
      const { input: current, runCardUpdate: run } = latest.current;
      if (!current.environmentId) return Promise.resolve(false);
      const environmentId = current.environmentId;
      const projectId = sectionProjectId(task);
      return run({
        environmentId,
        input: {
          ...workspaceScopeInput(activeWorkspaceId(environmentId)),
          taskId: task.id,
          actor: current.member,
          ...(projectId ? { projectId } : {}),
          ...patch,
        },
      }).then((result) => reportResult(result, failureTitle));
    },
    [reportResult, sectionProjectId],
  );

  // Edits carry the version the user saw, so one made from an old view is refused rather than
  // overwriting a newer change. Notes only append, so they never conflict.
  const patchAction = useCallback(
    (task: TaskView, patch: CardPatch, failureTitle: string) =>
      track(task.id, async () => {
        await updateCard(
          task,
          patch.note !== undefined ? patch : { ...patch, expectedUpdatedAt: task.updatedAt },
          failureTitle,
        );
      }),
    [track, updateCard],
  );

  // Opens a new chat with the task's prompt typed in but not sent, so the person can change the
  // model or the wording first and press Enter themselves. The server links the thread to the
  // card from the prompt once it is sent, so nothing is claimed here.
  const openDraftWithPrompt = useCallback(
    async (first: TaskView, text: string, selectedSlug: string | null): Promise<boolean> => {
      const { input: current, handleNewThread: newThread } = latest.current;
      const targetEnvironment = current.environmentId;
      if (!targetEnvironment) return false;
      const sectionProject = current.projects.find((item) => item.slug === first.section);
      const selectedProject =
        selectedSlug === null
          ? null
          : (current.projects.find((item) => item.slug === selectedSlug) ?? null);
      const project = pickLaunchProject({
        projects: readProjects().filter((item) => item.environmentId === targetEnvironment),
        taskProjectId: sectionProject?.projectId ?? null,
        selectedProjectId: selectedProject?.projectId ?? null,
        aiosRoot: current.aiosRoot,
      });
      if (!project) {
        report("No project to start the chat in", "Add a project to Leonidas Code first.");
        return false;
      }
      const opened = await newThread(scopeProjectRef(targetEnvironment, project.id));
      if (!opened) return false;
      useComposerDraftStore.getState().setPrompt(opened.draftId, text);
      return true;
    },
    [report],
  );

  const sendToAgent = useCallback(
    (task: TaskView) =>
      track(task.id, async () => {
        const { input: current, navigate: go } = latest.current;
        const targetEnvironment = current.environmentId;
        if (!targetEnvironment) return;
        const plan = planSend(
          task,
          (id) => readThreadShell(scopeThreadRef(targetEnvironment, id as ThreadId)) !== null,
        );
        if (plan.kind === "open") {
          toastManager.add({
            type: "info",
            title: "Already sent to the AI",
            description: task.title,
          });
          void go({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams(
              scopeThreadRef(targetEnvironment, plan.threadId as ThreadId),
            ),
          });
          return;
        }
        await openDraftWithPrompt(
          task,
          buildTaskPrompt(task, { aiosRoot: current.aiosRoot, member: current.member }),
          current.selectedSlug,
        );
      }),
    [openDraftWithPrompt, track],
  );

  // Several small tasks of one project share a single chat, opened the same way.
  const sendBatchToAgent = useCallback(
    (tasks: ReadonlyArray<TaskView>) => {
      const first = tasks[0];
      if (!first) return Promise.resolve();
      return track(
        tasks.map((item) => item.id),
        async () => {
          const { input: current } = latest.current;
          await openDraftWithPrompt(
            first,
            buildBatchPrompt(tasks, { aiosRoot: current.aiosRoot, member: current.member }),
            null,
          );
        },
      );
    },
    [openDraftWithPrompt, track],
  );

  const organize = useCallback(
    async (changes: ReadonlyArray<{ task: TaskView; suggestion: TriageSuggestion }>) => {
      await track(
        changes.map(({ task }) => task.id),
        async () => {
          const results = await Promise.all(
            changes.map(({ task, suggestion }) =>
              updateCard(
                task,
                {
                  ...(suggestion.effort ? { effort: suggestion.effort } : {}),
                  ...(suggestion.labels ? { labels: suggestion.labels } : {}),
                  note: "Organized automatically",
                },
                "Could not organize a task",
              ),
            ),
          );
          const done = results.filter(Boolean).length;
          if (done > 0) {
            toastManager.add({
              type: "success",
              title: `Organized ${done} ${done === 1 ? "task" : "tasks"}`,
            });
          }
        },
      );
    },
    [track, updateCard],
  );

  const setShared = useCallback(
    (task: TaskView, shared: boolean) =>
      track(task.id, async () => {
        const { input: current, runShare: run } = latest.current;
        const projectId = sectionProjectId(task);
        if (!current.environmentId || !projectId) {
          report("Cannot share this task", "Link this task to a project with a GitHub repository.");
          return;
        }
        const result = await run({
          environmentId: current.environmentId,
          input: { projectId, taskIds: [task.id], shared, actor: current.member },
        });
        reportResult(result, shared ? "Could not share the task" : "Could not stop sharing");
      }),
    [report, reportResult, sectionProjectId, track],
  );

  const shareSection = useCallback(
    (projectId: ProjectId) => {
      const { input: current, runShare: run } = latest.current;
      if (!current.environmentId) return;
      const environmentId = current.environmentId;
      setSharingSection(true);
      void run({
        environmentId,
        input: { projectId, shared: true, actor: current.member },
      })
        .then((result) => reportResult(result, "Could not share the open tasks"))
        .finally(() => {
          setSharingSection(false);
          latest.current.input.refresh();
        });
    },
    [reportResult],
  );

  const actions = useMemo<TaskActions>(
    () => ({
      canEdit,
      setStatus: (task, status) => void patchAction(task, { status }, "Could not change status"),
      setDue: (task, due) => void patchAction(task, { due }, "Could not change due date"),
      setMilestone: (task, milestone) =>
        void patchAction(task, { milestone }, "Could not change milestone"),
      setPriority: (task, priority) =>
        void patchAction(task, { priority }, "Could not change priority"),
      claim: (task) =>
        void patchAction(
          task,
          claimPatch(task, latest.current.input.member),
          "Could not claim the task",
        ),
      release: (task) => void patchAction(task, { claimedBy: null }, "Could not release the task"),
      setAssignee: (task, assignee) =>
        void patchAction(task, { assignee }, "Could not change the owner"),
      setPrivateArea: (task, area) =>
        void patchAction(
          task,
          { privateArea: area },
          area === null ? "Could not make the task public" : "Could not make the task private",
        ),
      linkProject: (task, slug) =>
        void patchAction(task, { projectSlug: slug }, "Could not change the project"),
      setShared: (task, shared) => void setShared(task, shared),
      sendToAgent: (task) => void sendToAgent(task),
      sendBatchToAgent: (tasks) => void sendBatchToAgent(tasks),
      organize: (changes) => void (changes.length > 0 && organize(changes)),
      addNote: (task, note) => void patchAction(task, { note }, "Could not add the note"),
      isBusy: (taskId) => busy.has(taskId),
      canShare: (task) => {
        const project = sections.find((item) => item.slug === task.section);
        return Boolean(project?.projectId && project.repository);
      },
      canSendToAgent: () => hasLaunchProject,
    }),
    [
      busy,
      canEdit,
      hasLaunchProject,
      organize,
      patchAction,
      sections,
      sendBatchToAgent,
      sendToAgent,
      setShared,
    ],
  );

  return { actions, shareSection, isSharingSection };
}

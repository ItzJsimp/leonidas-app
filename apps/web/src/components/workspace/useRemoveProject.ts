import { useCallback, useEffect, useRef } from "react";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useComposerDraftStore } from "../../composerDraftStore";
import { releaseProjectDraftUploads } from "../../lib/composerDraftUploads";
import { readLocalApi } from "../../localApi";
import { projectEnvironment } from "../../state/projects";
import { readEnvironmentScope } from "../../state/session";
import {
  ORCHESTRATION_OPERATE_DENIED_MESSAGE,
  useOrchestrationCommand,
} from "../../state/use-orchestration-command";
import { stackedThreadToast, toastManager } from "../ui/toast";

export interface RemovableProject {
  readonly environmentId: EnvironmentId;
  readonly id: ProjectId;
  readonly title: string;
  readonly workspaceRoot: string;
}

interface ProjectThread {
  readonly environmentId: EnvironmentId;
  readonly id: ThreadId;
  readonly projectId: ProjectId;
}

export function removeProjectConfirmMessage(input: {
  project: RemovableProject;
  environmentLabel?: string | undefined;
  threadCount: number;
}): string {
  const { project, environmentLabel, threadCount } = input;
  return [
    threadCount > 0
      ? `Remove project "${project.title}" and delete its ${threadCount} thread${threadCount === 1 ? "" : "s"}?`
      : `Remove project "${project.title}"?`,
    `Path: ${project.workspaceRoot}`,
    ...(environmentLabel ? [`Computer: ${environmentLabel}`] : []),
    threadCount > 0
      ? "This permanently clears conversation history for those chats and any archived chats."
      : "This permanently clears any archived conversation history.",
    "This removes only this project entry. Your files stay on disk.",
    ...(threadCount > 0 ? ["This action cannot be undone."] : []),
  ].join("\n");
}

/** Removes a project entry at once. A project with chats asks once first. Never touches files on disk. */
export function useRemoveProject(threads: ReadonlyArray<ProjectThread>) {
  const deleteProject = useOrchestrationCommand(projectEnvironment.delete, {
    reportFailure: false,
  });

  // A ref keeps the callback stable, so the picker rows do not rebuild on every thread update.
  const threadsRef = useRef(threads);
  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  return useCallback(
    async (project: RemovableProject, environmentLabel?: string) => {
      if (!readEnvironmentScope(project.environmentId, AuthOrchestrationOperateScope)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Action unavailable",
            description: ORCHESTRATION_OPERATE_DENIED_MESSAGE,
          }),
        );
        return;
      }
      const api = readLocalApi();
      if (!api) return;

      const projectThreads = threadsRef.current.filter(
        (thread) =>
          thread.environmentId === project.environmentId && thread.projectId === project.id,
      );
      if (projectThreads.length > 0) {
        const confirmed = await api.dialogs.confirm(
          removeProjectConfirmMessage({
            project,
            environmentLabel,
            threadCount: projectThreads.length,
          }),
          { variant: "destructive" },
        );
        if (!confirmed) return;
      }

      const projectRef = scopeProjectRef(project.environmentId, project.id);
      const result = await deleteProject({
        environmentId: project.environmentId,
        input: { projectId: project.id, force: true },
      });
      if (result._tag === "Failure") {
        if (isAtomCommandInterrupted(result)) return;
        const error = squashAtomCommandFailure(result);
        console.error("Failed to remove project", {
          projectId: project.id,
          environmentId: project.environmentId,
          ...safeErrorLogAttributes(error),
        });
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: `Could not remove "${project.title}"`,
            description: error instanceof Error ? error.message : "Unknown error removing project.",
          }),
        );
        return;
      }

      const draftStore = useComposerDraftStore.getState();
      releaseProjectDraftUploads(
        projectRef,
        projectThreads.map((thread) => scopeThreadRef(thread.environmentId, thread.id)),
      );
      const projectDraftThread = draftStore.getDraftThreadByProjectRef(projectRef);
      if (projectDraftThread) draftStore.clearDraftThread(projectDraftThread.draftId);
      draftStore.clearProjectDraftThreadId(projectRef);
    },
    [deleteProject],
  );
}

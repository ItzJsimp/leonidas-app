import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { DEFAULT_RUNTIME_MODE } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { useComposerDraftStore } from "~/composerDraftStore";
import { primaryServerProvidersAtom } from "~/state/server";
import { useProjects } from "~/state/entities";
import { threadEnvironment } from "~/state/threads";
import { useOrchestrationCommand } from "~/state/use-orchestration-command";
import { buildThreadRouteParams } from "~/threadRoutes";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { SidebarInset } from "../ui/sidebar";
import { Spinner } from "../ui/spinner";
import { findAiosProject, homeModelSelection, homeThreadId } from "./homeChat.logic";

/**
 * The Home chat: one permanent chat per AIOS, one click from the rail. It runs in the AIOS folder
 * and knows the team. The thread has a fixed id, so the first visit makes it and every later visit
 * only opens it. The user picks its model with the normal model picker.
 */
export function HomeChat() {
  const navigate = useNavigate();
  const { environmentId, active } = useActiveAiosWorkspace();
  const projects = useProjects();
  const providers = useAtomValue(primaryServerProvidersAtom);
  const createThread = useOrchestrationCommand(threadEnvironment.create, { reportFailure: false });
  const updateMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const project =
    environmentId === null || !active
      ? null
      : findAiosProject(
          projects.filter((candidate) => candidate.environmentId === environmentId),
          active.root,
        );
  const noModel = project !== null && providers.length > 0 && !hasConnectedModel(providers);

  useEffect(() => {
    if (environmentId === null || project === null || started.current) return;
    started.current = true;
    const threadId = homeThreadId(project.id);
    void (async () => {
      // A create call for a thread that exists fails. That is the normal case after the first visit.
      const { stickyActiveProvider, stickyModelSelectionByProvider } =
        useComposerDraftStore.getState();
      const modelSelection = homeModelSelection({
        lastUsed: stickyActiveProvider
          ? (stickyModelSelectionByProvider[stickyActiveProvider] ?? null)
          : null,
        projectDefault: project.defaultModelSelection ?? null,
        providers,
      });
      if (modelSelection !== null) {
        await createThread({
          environmentId,
          input: {
            threadId,
            projectId: project.id,
            title: "Home",
            modelSelection,
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: "default",
            branch: null,
            worktreePath: null,
          },
        });
      }
      const marked = await updateMetadata({ environmentId, input: { threadId, role: "home" } });
      if (marked._tag !== "Success") {
        started.current = false;
        setError("Home could not open. Check that an AI account is connected, then try again.");
        return;
      }
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(environmentId, threadId)),
        replace: true,
      });
    })();
  }, [environmentId, project, providers, createThread, updateMetadata, navigate]);

  const message =
    error ??
    (active && project === null
      ? "Add your AIOS folder as a project, then open Home again."
      : noModel
        ? "Connect an AI account in Settings, then open Home again."
        : null);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <Empty className="flex-1">
        <EmptyHeader className="max-w-md">
          {message === null ? (
            <Spinner />
          ) : (
            <>
              <EmptyTitle>Home is not ready</EmptyTitle>
              <EmptyDescription>{message}</EmptyDescription>
            </>
          )}
        </EmptyHeader>
      </Empty>
    </SidebarInset>
  );
}

const hasConnectedModel = (providers: ReadonlyArray<{ enabled: boolean; installed: boolean }>) =>
  providers.some((provider) => provider.enabled && provider.installed);

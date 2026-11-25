import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { DEFAULT_RUNTIME_MODE, type ThreadId } from "@t3tools/contracts";
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
import { agentThreadId, findAiosProject, homeModelSelection, homeThreadId } from "./homeChat.logic";

/**
 * The Home chat: one permanent chat per AIOS, one click from the rail. It runs in the AIOS folder
 * and knows the team. The thread has a fixed id, so the first visit makes it and every later visit
 * only opens it. The user picks its model with the normal model picker. This hook makes or opens the
 * thread and returns its id, or a plain message when it cannot.
 */
function useHomeThread() {
  return useProfileThread(null);
}

/**
 * The chat for one agent on the profile, or the Home chat when `agent` is null. An agent chat has
 * its own fixed id and the agent attached, so a second click opens the same chat.
 */
export function useProfileThread(agent: string | null) {
  const { environmentId, active, scopeReady } = useActiveAiosWorkspace();
  const projects = useProjects();
  const providers = useAtomValue(primaryServerProvidersAtom);
  const createThread = useOrchestrationCommand(threadEnvironment.create, { reportFailure: false });
  const updateMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const key = agent ?? "home";
  const label = agent ?? "Home";
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [ready, setReady] = useState<{ key: string; id: ThreadId } | null>(null);
  const started = useRef<string | null>(null);

  const project =
    environmentId === null || !active
      ? null
      : findAiosProject(
          projects.filter((candidate) => candidate.environmentId === environmentId),
          active.root,
        );
  const noModel = project !== null && providers.length > 0 && !hasConnectedModel(providers);

  useEffect(() => {
    if (environmentId === null || project === null || started.current === key) return;
    started.current = key;
    const chatId = agent === null ? homeThreadId(project.id) : agentThreadId(project.id, agent);
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
            threadId: chatId,
            projectId: project.id,
            title: label,
            modelSelection,
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: "default",
            branch: null,
            worktreePath: null,
          },
        });
      }
      const marked = await updateMetadata({
        environmentId,
        input:
          agent === null
            ? { threadId: chatId, role: "home" }
            : { threadId: chatId, attachedSubagent: agent },
      });
      if (marked._tag !== "Success") {
        started.current = null;
        setError({
          key,
          message: `${label} could not open. Check that an AI account is connected, then try again.`,
        });
        return;
      }
      setReady({ key, id: chatId });
    })();
  }, [environmentId, project, providers, createThread, updateMetadata, agent, key, label]);

  const threadId = ready?.key === key ? ready.id : null;
  const message =
    (error?.key === key ? error.message : null) ??
    (scopeReady && (!active || project === null)
      ? "Add your AIOS folder as a project, then open Home again."
      : noModel
        ? "Connect an AI account in Settings, then open Home again."
        : null);

  return { environmentId, threadId, message };
}

/** The `/home` route: opens the Home chat on its own page. */
export function HomeChat() {
  const navigate = useNavigate();
  const { environmentId, threadId, message } = useHomeThread();
  useEffect(() => {
    if (environmentId === null || threadId === null) return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId, threadId)),
      replace: true,
    });
  }, [environmentId, threadId, navigate]);

  return (
    <SidebarInset className="h-full min-h-0 overflow-hidden overscroll-y-none">
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

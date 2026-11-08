import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  type AtomCommandResult,
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ProjectId,
  type ThreadId,
  type RuntimeMode,
  type ProviderInteractionMode,
  type ModelSelection,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { useCallback } from "react";

import { newMessageId, newProjectId, newThreadId } from "../lib/utils";
import { getDefaultProviderInstanceModel } from "../providerInstances";
import { readProjects, waitForProject, waitForThreadShell } from "../state/entities";
import { projectEnvironment } from "../state/projects";
import { serverEnvironment } from "../state/server";
import { useEnvironmentScope } from "../state/session";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { DEFAULT_RUNTIME_MODE } from "../types";
import { resolvedFolderPath } from "./folderInspection.logic";
import { resolveOnboardingProjectId } from "./projectImport.logic";
import { useFolderInspection } from "./useFolderInspection";
import { getOnboardingProviderState } from "./providerReadiness.logic";

type EnsureFolderProjectResult =
  | { readonly ok: true; readonly projectId: ProjectId; readonly workspaceRoot: string }
  | { readonly ok: false; readonly message: string };

type StartChatResult =
  | { readonly ok: true; readonly threadId: ThreadId }
  | { readonly ok: false; readonly message: string };

const NO_PERMISSION_MESSAGE = "This computer does not allow creating chats.";

function folderTitle(folder: string): string {
  const segments = folder.split(/[\\/]+/).filter((segment) => segment.length > 0);
  const last = segments.at(-1);
  return last === undefined || last === "~" ? "AIOS" : last;
}

/**
 * Project and chat creation for the onboarding flow. Callers navigate to the
 * returned thread themselves; nothing here throws.
 */
export function useOnboardingChat(environmentId: EnvironmentId | undefined) {
  const canOperate = useEnvironmentScope(environmentId ?? null, AuthOrchestrationOperateScope);
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const createThread = useOrchestrationCommand(threadEnvironment.create, { reportFailure: false });
  const deleteThread = useOrchestrationCommand(threadEnvironment.delete, { reportFailure: false });
  const startThreadTurn = useOrchestrationCommand(threadEnvironment.startTurn, {
    reportFailure: false,
  });
  const inspectFolder = useFolderInspection(environmentId);
  const providers = useAtomValue(
    serverEnvironment.providersValueAtom(environmentId ?? ("" as EnvironmentId)),
  );
  const selectedProvider = providers?.find(
    (candidate) => getOnboardingProviderState(candidate) === "ready",
  );
  const selectedModel =
    selectedProvider && providers
      ? getDefaultProviderInstanceModel(providers, selectedProvider.instanceId)
      : undefined;

  const ensureFolderProject = useCallback(
    async (folder: string): Promise<EnsureFolderProjectResult> => {
      if (environmentId === undefined || !canOperate) {
        return { ok: false, message: NO_PERMISSION_MESSAGE };
      }
      try {
        // "~/AIOS" and the project root "C:\Users\Sam\AIOS" are one folder, but only the
        // server can tell. Without this, the second step created a second project for the
        // same root and the server refused it.
        const resolvedFolder = resolvedFolderPath(await inspectFolder(folder, []), folder);
        const existingId = resolveOnboardingProjectId(readProjects(), environmentId, {
          path: resolvedFolder,
        });
        if (existingId !== null) {
          const existing = readProjects().find(
            (project) => project.environmentId === environmentId && project.id === existingId,
          );
          if (existing !== undefined) {
            return { ok: true, projectId: existing.id, workspaceRoot: existing.workspaceRoot };
          }
        }
        const projectId = newProjectId();
        const result = await createProject({
          environmentId,
          input: {
            projectId,
            title: folderTitle(folder),
            workspaceRoot: resolvedFolder,
            createWorkspaceRootIfMissing: true,
            defaultModelSelection: null,
          },
        });
        if (result._tag !== "Success") {
          if (isAtomCommandInterrupted(result)) {
            return { ok: false, message: "Folder setup was interrupted. Try again." };
          }
          const error = squashAtomCommandFailure(result);
          return {
            ok: false,
            message: error instanceof Error ? error.message : "Could not set up that folder.",
          };
        }
        const created = await waitForProject(scopeProjectRef(environmentId, projectId));
        return { ok: true, projectId: created.id, workspaceRoot: created.workspaceRoot };
      } catch {
        return { ok: false, message: "Could not set up that folder." };
      }
    },
    [canOperate, createProject, environmentId, inspectFolder],
  );

  const startChat = useCallback(
    async (args: {
      readonly projectId: ProjectId;
      readonly title: string;
      readonly prompt: string;
      readonly runtimeMode?: RuntimeMode;
      readonly interactionMode?: ProviderInteractionMode;
      /** The model picked in the caller's own picker. Default: the first ready AI's default model. */
      readonly modelSelection?: ModelSelection;
    }): Promise<StartChatResult> => {
      if (environmentId === undefined || !canOperate) {
        return { ok: false, message: NO_PERMISSION_MESSAGE };
      }
      const provider = selectedProvider;
      const model = selectedModel;
      if (args.modelSelection === undefined && (provider === undefined || model === undefined)) {
        return { ok: false, message: "Connect an AI first." };
      }
      const modelSelection =
        args.modelSelection ?? createModelSelection(provider!.instanceId, model!);
      const threadId = newThreadId();
      const createdAt = new Date().toISOString();
      try {
        const createResult = await createThread({
          environmentId,
          input: {
            threadId,
            projectId: args.projectId,
            title: args.title,
            modelSelection,
            runtimeMode: args.runtimeMode ?? DEFAULT_RUNTIME_MODE,
            interactionMode: args.interactionMode ?? "default",
            branch: null,
            worktreePath: null,
            createdAt,
          },
        });
        let failure: AtomCommandResult<unknown, unknown> | null =
          createResult._tag === "Failure" ? createResult : null;
        if (failure === null) {
          const startResult = await startThreadTurn({
            environmentId,
            input: {
              threadId,
              message: {
                messageId: newMessageId(),
                role: "user",
                text: args.prompt,
                attachments: [],
              },
              modelSelection,
              titleSeed: args.title,
              runtimeMode: args.runtimeMode ?? DEFAULT_RUNTIME_MODE,
              interactionMode: args.interactionMode ?? "default",
              createdAt,
            },
          });
          failure = startResult._tag === "Failure" ? startResult : null;
          if (failure !== null) {
            const cleanup = await deleteThread({ environmentId, input: { threadId } });
            if (cleanup._tag === "Failure" && !isAtomCommandInterrupted(cleanup)) {
              console.warn(
                "Failed to clean up onboarding thread after start failure.",
                squashAtomCommandFailure(cleanup),
              );
            }
          }
        }
        if (failure === null) {
          // The caller opens the chat next. A chat the app has not received yet reads as missing,
          // and the chat route then sends the user to a new empty chat.
          await waitForThreadShell(scopeThreadRef(environmentId, threadId));
          return { ok: true, threadId };
        }
        if (isAtomCommandInterrupted(failure)) {
          return { ok: false, message: "Starting the chat was interrupted. Try again." };
        }
        const error = squashAtomCommandFailure(failure);
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Could not start the chat.",
        };
      } catch {
        return { ok: false, message: "Could not start the chat." };
      }
    },
    [
      canOperate,
      createThread,
      deleteThread,
      environmentId,
      selectedProvider,
      selectedModel,
      startThreadTurn,
    ],
  );

  return {
    canOperate,
    ensureFolderProject,
    startChat,
    providerName: selectedProvider?.driver ?? null,
    modelName: selectedModel ?? null,
    defaultSelection:
      selectedProvider && selectedModel
        ? createModelSelection(selectedProvider.instanceId, selectedModel)
        : null,
  };
}

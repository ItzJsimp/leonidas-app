import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type { ImageItem, ImagesState, ProjectId, ImagesSetupInput } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useCallback, useMemo } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";
import { randomUUID } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useProjects } from "~/state/entities";
import {
  imagesCancel,
  imagesGenerate,
  imagesKeep,
  imagesLive,
  imagesRetry,
  imagesSetBaseUrl,
  imagesSetup,
  imagesImportReference,
  imagesDelete,
  imagesSetRetention,
  imagesImprovePrompt,
} from "~/state/images";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { toastManager } from "~/components/ui/toast";

import { resolveSelectedModels } from "./images.logic";
import { discardReferenceUpload, uploadReference } from "./importReference";

/** What the form remembers between visits. */
const FormMemory = Schema.Struct({
  projectId: Schema.NullOr(Schema.String),
  prompt: Schema.String,
  modelIds: Schema.Array(Schema.String),
  count: Schema.Number,
  seed: Schema.String,
});
type FormMemory = typeof FormMemory.Type;

const EMPTY_MEMORY: FormMemory = {
  projectId: null,
  prompt: "",
  modelIds: ["flux2klein"],
  count: 2,
  seed: "",
};

function unwrap<A, E>(result: AtomCommandResult<A, E>): A {
  if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  return result.value;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Everything the Images panel needs: form memory, live state and the four actions. */
export function useImages() {
  const environmentId = usePrimaryEnvironmentId();
  const allProjects = useProjects();
  const projects = useMemo(
    () => allProjects.filter((project) => project.environmentId === environmentId),
    [allProjects, environmentId],
  );
  const [memory, writeMemory] = useLocalStorage("leonidas:images:form", EMPTY_MEMORY, FormMemory);

  const project =
    projects.find((candidate) => candidate.id === memory.projectId) ?? projects[0] ?? null;
  const live = useEnvironmentQuery(
    environmentId === null || project === null
      ? null
      : imagesLive({ environmentId, input: { projectId: project.id } }),
  );
  const state: ImagesState | null = live.data;
  const selectedModelIds = useMemo(
    () => (state ? resolveSelectedModels(state.models, memory.modelIds) : [...memory.modelIds]),
    [memory.modelIds, state],
  );

  const patchMemory = useCallback(
    (patch: Partial<FormMemory>) => writeMemory((current) => ({ ...current, ...patch })),
    [writeMemory],
  );

  const runGenerate = useAtomCommand(imagesGenerate, { reportFailure: false });
  const runCancel = useAtomCommand(imagesCancel, { reportFailure: false });
  const runRetry = useAtomCommand(imagesRetry, { reportFailure: false });
  const runKeep = useAtomCommand(imagesKeep, { reportFailure: false });
  const runSetBaseUrl = useAtomCommand(imagesSetBaseUrl, { reportFailure: false });
  const runSetup = useAtomCommand(imagesSetup, { reportFailure: false });
  const runImportReference = useAtomCommand(imagesImportReference, { reportFailure: false });
  const runDelete = useAtomCommand(imagesDelete, { reportFailure: false });
  const runSetRetention = useAtomCommand(imagesSetRetention, { reportFailure: false });
  const runImprovePrompt = useAtomCommand(imagesImprovePrompt, { reportFailure: false });
  const improvePrompt = useCallback(
    async (prompt: string) => {
      if (!environmentId || !project) throw new Error("Add a project before improving a prompt.");
      return unwrap(
        await runImprovePrompt({ environmentId, input: { projectId: project.id, prompt } }),
      ).prompt;
    },
    [environmentId, project, runImprovePrompt],
  );

  const importReference = useCallback(
    async (file: File, signal?: AbortSignal): Promise<string | null> => {
      let attachmentId: string | null = null;
      try {
        if (!environmentId || !project) throw new Error("Add a project before importing an image.");
        attachmentId = await uploadReference(environmentId, file, signal);
        signal?.throwIfAborted();
        const result = unwrap(
          await runImportReference({
            environmentId,
            input: { projectId: project.id, attachmentId },
          }),
        );
        return result.itemId;
      } catch (error) {
        if (signal?.aborted) return null;
        toastManager.add({
          type: "error",
          title: "Could not import the image",
          description: errorText(error),
        });
        return null;
      } finally {
        if (environmentId && attachmentId) discardReferenceUpload(environmentId, attachmentId);
      }
    },
    [environmentId, project, runImportReference],
  );

  const attempt = useCallback(async (title: string, action: () => Promise<void>) => {
    try {
      await action();
      return true;
    } catch (error) {
      toastManager.add({ type: "error", title, description: errorText(error) });
      return false;
    }
  }, []);

  const start = useCallback(
    async (input: {
      readonly prompt: string;
      readonly modelIds: ReadonlyArray<string>;
      readonly seed: number | null;
      readonly count: number;
      readonly width?: number;
      readonly height?: number;
      readonly referenceItemId?: string;
      readonly maskPng?: string;
    }) => {
      try {
        if (environmentId === null || project === null) {
          throw new Error("Add a project first. Images are saved in its folder.");
        }
        return unwrap(
          await runGenerate({
            environmentId,
            input: {
              projectId: project.id,
              ...input,
              clientRequestId: randomUUID(),
              prompt: input.prompt.trim(),
            },
          }),
        );
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not start the images",
          description: errorText(error),
        });
        return false;
      }
    },
    [environmentId, project, runGenerate],
  );

  const generate = useCallback(
    (seed: number | null) =>
      start({ prompt: memory.prompt, modelIds: selectedModelIds, seed, count: memory.count }),
    [memory.count, memory.prompt, selectedModelIds, start],
  );

  const cancel = useCallback(
    (stopRunning: boolean, jobId?: string) =>
      attempt("Could not cancel", async () => {
        if (environmentId === null) return;
        unwrap(
          await runCancel({
            environmentId,
            input: { stopRunning, ...(jobId === undefined ? {} : { jobId }) },
          }),
        );
      }),
    [attempt, environmentId, runCancel],
  );

  const keep = useCallback(
    (item: ImageItem, kept: boolean) =>
      attempt("Could not keep the image", async () => {
        if (environmentId === null || project === null) return;
        unwrap(
          await runKeep({
            environmentId,
            input: { projectId: project.id, itemId: item.id, kept },
          }),
        );
      }),
    [attempt, environmentId, project, runKeep],
  );

  const retry = useCallback(
    (item: ImageItem) =>
      attempt("Could not try the image again", async () => {
        if (environmentId === null || project === null) return;
        unwrap(
          await runRetry({ environmentId, input: { projectId: project.id, itemId: item.id } }),
        );
      }),
    [attempt, environmentId, project, runRetry],
  );

  const setBaseUrl = useCallback(
    (baseUrl: string) =>
      attempt("Could not save the address", async () => {
        if (environmentId === null) return;
        unwrap(await runSetBaseUrl({ environmentId, input: { baseUrl } }));
      }),
    [attempt, environmentId, runSetBaseUrl],
  );

  const setup = useCallback(
    (input: ImagesSetupInput) =>
      attempt("Could not set up Images", async () => {
        if (environmentId === null) throw new Error("Connect to your computer first.");
        unwrap(await runSetup({ environmentId, input }));
      }),
    [attempt, environmentId, runSetup],
  );

  const remove = useCallback(
    (item: ImageItem) =>
      attempt("Could not delete the image", async () => {
        if (!environmentId || !project) throw new Error("Select the image project first.");
        unwrap(
          await runDelete({ environmentId, input: { projectId: project.id, itemId: item.id } }),
        );
      }),
    [attempt, environmentId, project, runDelete],
  );
  const setRetention = useCallback(
    (enabled: boolean) =>
      attempt("Could not change image cleanup", async () => {
        if (!environmentId) throw new Error("Connect to the computer first.");
        unwrap(await runSetRetention({ environmentId, input: { enabled } }));
      }),
    [attempt, environmentId, runSetRetention],
  );

  return {
    remove,
    setRetention,
    environmentId,
    projects,
    projectId: (project?.id ?? null) as ProjectId | null,
    state,
    error: live.error,
    isPending: live.isPending && state === null,
    memory,
    selectedModelIds,
    patchMemory,
    start,
    generate,
    cancel,
    keep,
    retry,
    setBaseUrl,
    setup,
    importReference,
    improvePrompt,
  };
}

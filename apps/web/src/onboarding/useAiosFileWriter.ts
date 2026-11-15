import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { AuthFilesystemWriteScope, type EnvironmentId } from "@t3tools/contracts";
import { useCallback } from "react";

import { projectEnvironment } from "~/state/projects";
import { useEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";
import { planCreateOnly, type PlannedFile } from "./aiosInterview.logic";
import { needsConfirmation } from "./folderInspection.logic";
import { isSetupPreview } from "./setupPreview";
import { useFolderInspection } from "./useFolderInspection";
import { useOnboardingChat } from "./useOnboardingChat";

export type AiosWriteResult =
  | { readonly ok: true; readonly created: readonly string[]; readonly skipped: readonly string[] }
  | { readonly ok: false; readonly message: string; readonly needsConfirmation?: true };

/**
 * Writes setup files into the AIOS folder, create-only: a file that already exists is kept.
 * shortcut: copies the write loop in AiosInterviewForm, delete that copy when WelcomeWizard goes.
 */
export function useAiosFileWriter(environmentId: EnvironmentId | undefined) {
  const { canOperate, ensureFolderProject } = useOnboardingChat(environmentId);
  const canWriteFiles = useEnvironmentScope(environmentId ?? null, AuthFilesystemWriteScope);
  const writeFile = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });
  const inspectFolder = useFolderInspection(environmentId);
  const canWrite = environmentId !== undefined && canOperate && canWriteFiles;

  const write = useCallback(
    async (
      folder: string,
      planned: readonly PlannedFile[],
      options: { readonly allowExisting?: boolean } = {},
    ): Promise<AiosWriteResult> => {
      if (isSetupPreview()) {
        return { ok: true, created: planned.map((file) => file.relativePath), skipped: [] };
      }
      if (!environmentId || !canWrite) {
        return { ok: false, message: "This computer cannot save files to your AI's folder yet." };
      }
      const inspection = await inspectFolder(
        folder,
        planned.map((file) => file.relativePath),
      );
      if (inspection._tag === "unknown" || inspection._tag === "notDirectory") {
        return {
          ok: false,
          message:
            "Could not check that folder, so nothing was saved. Check the folder and try again.",
        };
      }
      if (inspection._tag === "unreadable") {
        return {
          ok: false,
          message:
            "Leonidas cannot read that folder. Choose a folder that you can open, then try again.",
        };
      }
      if (!options.allowExisting && needsConfirmation(inspection)) {
        return {
          ok: false,
          needsConfirmation: true,
          message:
            "This folder already has other files. Press the button again to add your AI's files next to them. Nothing is replaced.",
        };
      }
      const existing = inspection._tag === "directory" ? inspection.existingFiles : [];
      const plan = planCreateOnly(planned, existing);
      const project = await ensureFolderProject(folder);
      if (!project.ok) {
        return { ok: false, message: "Could not use that folder. Check its location and name." };
      }
      const created: string[] = [];
      for (const file of plan.toCreate) {
        const result = await writeFile({
          environmentId,
          input: {
            cwd: project.workspaceRoot,
            relativePath: file.relativePath,
            contents: file.contents,
          },
        });
        if (result._tag !== "Success") {
          if (isAtomCommandInterrupted(result))
            return {
              ok: false,
              message:
                "Saving stopped before the end. Press the button again to save the rest. Saved files are skipped.",
            };
          const error = squashAtomCommandFailure(result);
          return {
            ok: false,
            message: `Could not save ${file.relativePath}. ${
              error instanceof Error ? error.message : "Try again."
            } Files already saved are kept.`,
          };
        }
        created.push(file.relativePath);
      }
      return { ok: true, created, skipped: plan.skipped };
    },
    [canWrite, ensureFolderProject, environmentId, inspectFolder, writeFile],
  );

  return { canWrite, write };
}

import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useCallback, useState } from "react";

import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { useComposerDraftStore } from "~/composerDraftStore";
import { useHandleNewThread } from "~/hooks/useHandleNewThread";
import { useProjects } from "~/state/entities";

import { placeReplanPrompt } from "./direction.logic";

const sameFolder = (a: string, b: string) =>
  a
    .replace(/[\\/]+$/, "")
    .replace(/\\/g, "/")
    .toLowerCase() ===
  b
    .replace(/[\\/]+$/, "")
    .replace(/\\/g, "/")
    .toLowerCase();

/** Copies a prompt and puts it in a new chat box, with a plain notice about what happened. */
export function usePlacePrompt() {
  const { active } = useActiveAiosWorkspace();
  const projects = useProjects();
  const { handleNewThread, defaultProjectRef } = useHandleNewThread();
  const [notice, setNotice] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  const place = useCallback(
    async (prompt: string) => {
      const project = active
        ? projects.find((candidate) => sameFolder(candidate.workspaceRoot, active.root))
        : undefined;
      const projectRef = project
        ? scopeProjectRef(project.environmentId, project.id)
        : defaultProjectRef;
      const result = await placeReplanPrompt(
        {
          writeClipboard: (text) => navigator.clipboard.writeText(text),
          openDraft: async () => {
            if (projectRef === null) return null;
            const opened = await handleNewThread(projectRef);
            if (!opened) return null;
            return {
              setPrompt: (text) => useComposerDraftStore.getState().setPrompt(opened.draftId, text),
            };
          },
        },
        prompt,
      );
      setFallbackText(result.placed || result.copied ? null : prompt);
      setNotice(
        result.placed
          ? result.copied
            ? "Prompt copied and placed in the chat box. Read it, then send it."
            : "Prompt placed in the chat box. Read it, then send it."
          : result.copied
            ? "Prompt copied. Open a chat and paste it."
            : "Copy the prompt below into a chat.",
      );
    },
    [active, defaultProjectRef, handleNewThread, projects],
  );

  return { place, notice, fallbackText };
}

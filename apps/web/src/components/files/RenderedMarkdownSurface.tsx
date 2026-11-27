import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";

import { ScrollArea } from "~/components/ui/scroll-area";

import { FileMarkdownPreview } from "./FileMarkdownPreview";
import { setMarkdownTaskChecked } from "./filePreviewMode";
import { setFrontmatterValue } from "./frontmatter.logic";
import {
  getOptimisticProjectFileQueryData,
  setProjectFileQueryData,
} from "./projectFilesQueryState";
import { useFileSaveCoordinator } from "./useFileSaveCoordinator";

/** A rendered Markdown file that saves checkbox ticks and property changes. */
export function RenderedMarkdownSurface({
  environmentId,
  cwd,
  relativePath,
  contents,
  threadRef,
  readOnly,
  onPendingChange,
}: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string;
  readonly contents: string;
  readonly threadRef: ScopedThreadRef;
  readonly readOnly: boolean;
  readonly onPendingChange: (relativePath: string, pending: boolean) => void;
}) {
  const saveCoordinator = useFileSaveCoordinator({
    environmentId,
    cwd,
    relativePath,
    onPendingChange,
  });
  const updateContents = (change: (current: string) => string) => {
    const currentContents =
      getOptimisticProjectFileQueryData(environmentId, cwd, relativePath)?.contents ?? contents;
    const nextContents = change(currentContents);
    if (nextContents === currentContents) return;
    setProjectFileQueryData(environmentId, cwd, relativePath, nextContents);
    saveCoordinator.change(nextContents);
  };

  return (
    <ScrollArea className="min-h-0 flex-1">
      <FileMarkdownPreview
        text={contents}
        cwd={cwd}
        relativePath={relativePath}
        threadRef={threadRef}
        onTaskListChange={
          readOnly
            ? undefined
            : ({ markerOffset, checked }) =>
                updateContents((current) => setMarkdownTaskChecked(current, markerOffset, checked))
        }
        onPropertyChange={
          readOnly
            ? undefined
            : (key, value) => updateContents((current) => setFrontmatterValue(current, key, value))
        }
      />
    </ScrollArea>
  );
}

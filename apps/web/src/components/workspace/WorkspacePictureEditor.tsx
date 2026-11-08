import { useRef, useState } from "react";

import { useAtomCommand } from "~/state/use-atom-command";
import { workspacePictureSet } from "~/state/workspacePictures";

import { prepareWorkspacePicture, useWorkspacePictures } from "./WorkspacePicture";
import { validatePictureFile, WORKSPACE_PICTURE_UPLOAD_TYPES } from "./workspacePicture.logic";

/**
 * Change a workspace picture: `pick(id)` opens the file picker, and the server keeps the picture
 * for every client. Render `input` once, next to the buttons that call `pick`.
 */
export function useWorkspacePictureUpload() {
  const { environmentId, refresh } = useWorkspacePictures();
  const runSet = useAtomCommand(workspacePictureSet, { reportFailure: false });
  const fileInput = useRef<HTMLInputElement>(null);
  const target = useRef<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (workspaceId: string, file: File) => {
    const invalid = validatePictureFile(file);
    if (invalid || !environmentId) {
      setError(invalid ?? "Connect to your computer to change the picture.");
      return;
    }
    setBusy(workspaceId);
    setError(null);
    let dataUrl: string;
    try {
      dataUrl = await prepareWorkspacePicture(file);
    } catch {
      setBusy(null);
      setError("Could not read this image. Try another file.");
      return;
    }
    const result = await runSet({ environmentId, input: { workspaceId, dataUrl } });
    setBusy(null);
    if (result._tag === "Success") refresh();
    else setError("Could not save the picture. Try again.");
  };

  return {
    busy,
    error,
    pick: (workspaceId: string) => {
      target.current = workspaceId;
      fileInput.current?.click();
    },
    input: (
      <input
        ref={fileInput}
        type="file"
        accept={WORKSPACE_PICTURE_UPLOAD_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file && target.current) void upload(target.current, file);
        }}
      />
    ),
  };
}

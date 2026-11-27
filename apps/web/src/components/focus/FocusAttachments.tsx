import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import {
  FOCUS_FILE_MAX_BYTES,
  FOCUS_FILES_MAX,
  type EnvironmentId,
  type FocusFileInput,
} from "@t3tools/contracts";
import { FileIcon, ImageIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { focusAttachmentRead } from "~/state/taskBoard";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { useActiveAiosWorkspace } from "../workspace/useActiveAiosWorkspace";
import type { NoteAttachment } from "./focusWidget.logic";

/** Reads dropped, pasted or chosen files into the form the server takes. `error` names the first file that cannot be used. */
export async function readFocusFiles(
  files: ReadonlyArray<File>,
  alreadyAttached = 0,
): Promise<{ files: FocusFileInput[]; error: string | null }> {
  const out: FocusFileInput[] = [];
  let error: string | null = null;
  for (const file of files) {
    if (alreadyAttached + out.length >= FOCUS_FILES_MAX) {
      error = `You can attach up to ${FOCUS_FILES_MAX} files at a time.`;
      break;
    }
    if (file.size === 0 || file.size > FOCUS_FILE_MAX_BYTES) {
      error = `${file.name || "That file"} must be between 1 byte and ${FOCUS_FILE_MAX_BYTES / 1024 / 1024} MB.`;
      continue;
    }
    const buffer = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buffer.length; i += 0x8000) {
      binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
    }
    out.push({
      name: file.name || (file.type.startsWith("image/") ? "pasted-image.png" : "file"),
      mimeType: file.type,
      dataBase64: btoa(binary),
    });
  }
  return { files: out, error };
}

/** The files of a drop or paste event, or an empty list when it holds only text. */
export const filesOfTransfer = (transfer: DataTransfer | null): File[] =>
  transfer ? Array.from(transfer.files) : [];

/** Reads one attached file from the server and gives back a blob URL the caller must revoke. */
function useAttachmentLoader(environmentId: EnvironmentId, path: string) {
  const run = useAtomCommand(focusAttachmentRead, { reportFailure: false });
  const workspace = useActiveAiosWorkspace();
  return useCallback(async () => {
    const result = await run({ environmentId, input: { path, ...workspace.scope } });
    if (result._tag !== "Success" || isAtomCommandInterrupted(result)) return null;
    const bytes = Uint8Array.from(atob(result.value.dataBase64), (c) => c.charCodeAt(0));
    return {
      name: result.value.name,
      url: URL.createObjectURL(new Blob([bytes], { type: result.value.mimeType })),
    };
  }, [environmentId, path, run, workspace.scope]);
}

function RemoveButton(props: { name: string; onRemove: () => void }) {
  return (
    <span className="absolute top-0.5 right-0.5 opacity-0 pointer-coarse:opacity-100 group-hover/attachment:opacity-100 group-focus-within/attachment:opacity-100">
      <Button
        size="icon-xs"
        variant="media-close"
        aria-label={`Remove attachment ${props.name}`}
        onClick={props.onRemove}
      >
        <XIcon />
      </Button>
    </span>
  );
}

function ImageAttachment(props: {
  environmentId: EnvironmentId;
  attachment: NoteAttachment;
  onRemove: () => void;
}) {
  const load = useAttachmentLoader(props.environmentId, props.attachment.path);
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({
    url: null,
    failed: false,
  });
  const [large, setLarge] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    void load().then((loaded) => {
      if (cancelled) {
        if (loaded) URL.revokeObjectURL(loaded.url);
        return;
      }
      created = loaded?.url ?? null;
      setState({ url: created, failed: loaded === null });
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [load]);
  return (
    <span className="group/attachment relative inline-block max-w-full">
      {state.url ? (
        <button
          type="button"
          className="block max-w-full cursor-zoom-in rounded border border-border outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-label={`${large ? "Shrink" : "Enlarge"} image: ${props.attachment.name}`}
          onClick={() => setLarge((value) => !value)}
        >
          <img
            src={state.url}
            alt={props.attachment.name}
            className={`rounded object-contain ${large ? "max-h-72" : "max-h-24"}`}
          />
        </button>
      ) : (
        <span className="flex h-12 w-20 items-center justify-center rounded border border-border text-muted-foreground text-xs">
          {state.failed ? <ImageIcon className="size-4 opacity-50" /> : "Loading"}
        </span>
      )}
      <RemoveButton name={props.attachment.name} onRemove={props.onRemove} />
    </span>
  );
}

function FileAttachment(props: {
  environmentId: EnvironmentId;
  attachment: NoteAttachment;
  onRemove: () => void;
}) {
  const load = useAttachmentLoader(props.environmentId, props.attachment.path);
  const open = async () => {
    const loaded = await load();
    if (!loaded) return;
    const link = document.createElement("a");
    link.href = loaded.url;
    link.download = loaded.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(loaded.url), 10_000);
  };
  return (
    <span className="group/attachment relative inline-flex max-w-full items-center">
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-1 rounded border border-border px-1.5 py-0.5 pr-5 text-xs outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={`Save a copy of ${props.attachment.name}`}
        onClick={() => void open()}
      >
        <FileIcon className="size-3 shrink-0" />
        <span className="truncate">{props.attachment.name}</span>
      </button>
      <RemoveButton name={props.attachment.name} onRemove={props.onRemove} />
    </span>
  );
}

/** The files attached to one note: image thumbnails and file chips. */
export function NoteAttachments(props: {
  environmentId: EnvironmentId;
  attachments: ReadonlyArray<NoteAttachment>;
  onRemove: (attachment: NoteAttachment) => void;
}) {
  if (props.attachments.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap items-start gap-1.5">
      {props.attachments.map((attachment) =>
        attachment.image ? (
          <ImageAttachment
            key={attachment.path}
            environmentId={props.environmentId}
            attachment={attachment}
            onRemove={() => props.onRemove(attachment)}
          />
        ) : (
          <FileAttachment
            key={attachment.path}
            environmentId={props.environmentId}
            attachment={attachment}
            onRemove={() => props.onRemove(attachment)}
          />
        ),
      )}
    </span>
  );
}

/** Files the user chose for a note that is not saved yet. */
export function PendingFiles(props: {
  files: ReadonlyArray<FocusFileInput>;
  onRemove: (index: number) => void;
}) {
  if (props.files.length === 0) return null;
  return (
    <ul className="mb-1.5 flex flex-wrap gap-1" aria-label="Files to attach">
      {props.files.map((file, index) => (
        <li
          key={`${file.name}:${index}`}
          className="inline-flex max-w-full items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs"
        >
          <FileIcon className="size-3 shrink-0" />
          <span className="truncate">{file.name}</span>
          <button
            type="button"
            className="rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            aria-label={`Do not attach ${file.name}`}
            onClick={() => props.onRemove(index)}
          >
            <XIcon className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

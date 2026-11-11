import type { EnvironmentId } from "@t3tools/contracts";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import {
  deletePendingAttachmentUpload,
  runAttachmentUploadCycle,
} from "@t3tools/client-runtime/state/attachments";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { attachmentEnvironment } from "~/state/attachments";
import { readEnvironmentScope, readPreparedConnection } from "~/state/session";
import { pngDimensions } from "./imageExport";

export function discardReferenceUpload(environmentId: EnvironmentId, attachmentId: string) {
  deletePendingAttachmentUpload({
    registry: appAtomRegistry,
    remove: attachmentEnvironment.remove,
    environmentId,
    attachmentId,
  });
}

/** References use the existing signed streaming upload instead of large RPC payloads. */
export async function uploadReference(
  environmentId: EnvironmentId,
  file: File,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  if (!file.size || file.size > 16 * 1024 ** 2)
    throw new Error("Choose a PNG image smaller than 16 MB.");
  const { width, height } = pngDimensions(new Uint8Array(await file.slice(0, 33).arrayBuffer()));
  if (!width || !height || width > 2048 || height > 2048)
    throw new Error("Choose a PNG image no larger than 2048 pixels on each side.");
  if (!readEnvironmentScope(environmentId, AuthOrchestrationOperateScope))
    throw new Error("This connection cannot upload images.");
  const result = await runAttachmentUploadCycle({
    registry: appAtomRegistry,
    createUploadUrl: attachmentEnvironment.createUploadUrl,
    remove: attachmentEnvironment.remove,
    environmentId,
    upload: { type: "image", name: "reference.png", mimeType: "image/png", sizeBytes: file.size },
    resolveUploadUrl: (relativeUrl) => {
      if (!readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)) return null;
      const connection = readPreparedConnection(environmentId);
      return connection ? resolveAssetUrl(connection.httpBaseUrl, relativeUrl) : null;
    },
    transport: (url) => {
      const controller = new AbortController();
      return {
        abort: () => controller.abort(),
        done: fetch(url, {
          method: "POST",
          body: file,
          headers: { "Content-Type": "image/png" },
          credentials: "include",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(120000),
            ...(signal ? [signal] : []),
          ]),
        }).then((response) => {
          if (!response.ok) throw new Error(`Image upload failed (${response.status}).`);
        }),
      };
    },
  });
  if (result.status === "uploaded") return result.attachmentId;
  if (result.attachmentId) discardReferenceUpload(environmentId, result.attachmentId);
  throw result.status === "failed" ? result.error : new Error("The image upload was cancelled.");
}

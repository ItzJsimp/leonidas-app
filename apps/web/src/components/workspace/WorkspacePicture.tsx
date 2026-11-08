import { WORKSPACE_PICTURE_SIDE } from "@t3tools/contracts";
import { BriefcaseIcon, UserIcon } from "lucide-react";

import { firstGrapheme } from "~/components/twoState/safeText";
import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { workspacePicturesQuery } from "~/state/workspacePictures";

import { centerSquare, fitsPictureLimit, workspacePictureUrl } from "./workspacePicture.logic";

const NO_PICTURES: Readonly<Record<string, string>> = {};

/** Every workspace picture on the primary environment's server. */
export function useWorkspacePictures() {
  const environmentId = usePrimaryEnvironmentId();
  const query = useEnvironmentQuery(
    environmentId ? workspacePicturesQuery({ environmentId, input: {} }) : null,
  );
  return {
    environmentId,
    pictures: query.data?.pictures ?? NO_PICTURES,
    refresh: query.refresh,
  };
}

/** A round workspace picture, or the first letter of its name when it has none. */
export function WorkspacePicture(props: {
  readonly workspaceId: string | null | undefined;
  readonly name: string;
  readonly pictures: Readonly<Record<string, string>>;
  readonly className?: string;
}) {
  const url = workspacePictureUrl(props.pictures, props.workspaceId);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-raised font-semibold text-foreground",
        props.className,
      )}
    >
      {url ? (
        <img alt="" src={url} draggable={false} className="size-full object-cover" />
      ) : (
        firstGrapheme(props.name).toUpperCase()
      )}
    </span>
  );
}

/** "Personal" or "Business", with its icon. */
export function WorkspaceTypeChip({ business }: { readonly business: boolean }) {
  const Icon = business ? BriefcaseIcon : UserIcon;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-raised px-1.5 text-3xs leading-4 font-medium text-foreground">
      <Icon aria-hidden className="size-2.5" />
      {business ? "Business" : "Personal"}
    </span>
  );
}

/** Crops the centered square of an image and scales it to 256 px, as a data URL for the server. */
export async function prepareWorkspacePicture(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const square = centerSquare(bitmap.width, bitmap.height);
    const side = Math.min(WORKSPACE_PICTURE_SIDE, square.size);
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.drawImage(bitmap, square.x, square.y, square.size, square.size, 0, 0, side, side);
    // A browser without WebP encoding returns PNG here, which still fits at 256 px.
    const dataUrl = canvas.toDataURL("image/webp", 0.9);
    if (!fitsPictureLimit(dataUrl)) throw new Error("The picture is too large after resizing.");
    return dataUrl;
  } finally {
    bitmap.close();
  }
}

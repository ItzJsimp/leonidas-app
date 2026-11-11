import { TriangleAlertIcon } from "lucide-react";

import { isElectron } from "../../env";
import { useDesktopUpdateState } from "../../state/desktopUpdate";
import {
  getArm64IntelBuildWarningDescription,
  shouldShowArm64IntelBuildWarning,
} from "../desktopUpdate.logic";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { UpdateReadyPill } from "./UpdateReadyPill";

export function SidebarUpdateArchitectureWarning() {
  return isElectron ? <SidebarUpdateArchitectureWarningContent /> : null;
}

function SidebarUpdateArchitectureWarningContent() {
  const state = useDesktopUpdateState();
  const visible = shouldShowArm64IntelBuildWarning(state);
  const description = state && visible ? getArm64IntelBuildWarningDescription(state) : null;

  if (!visible || !description) return null;

  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>Intel version on Apple Silicon</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

/** Desktop only. A small "Update ready" pill under the rail; see UpdateReadyPill. */
export function SidebarUpdatePill({
  className,
  expanded,
}: {
  readonly className?: string | undefined;
  readonly expanded?: boolean | undefined;
} = {}) {
  return isElectron ? <UpdateReadyPill className={className} expanded={expanded ?? true} /> : null;
}

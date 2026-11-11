import type { DesktopBridge, DesktopUpdateState } from "@t3tools/contracts";
import { toastManager } from "./ui/toast";
import { userErrorToastFields } from "~/lib/userErrorToast";

/** The updater can publish its terminal state after the check RPC resolves. */
export async function checkForDesktopUpdateWithFeedback(
  shell: Pick<DesktopBridge, "checkForUpdate" | "onUpdateState">,
) {
  let finished = false;
  let unsubscribe = () => {};
  const finish = (state: DesktopUpdateState) => {
    if (finished || state.status === "checking" || state.status === "idle") return;
    finished = true;
    unsubscribe();
    if (state.status === "up-to-date") {
      toastManager.add({
        type: "success",
        title: "You're up to date",
        description: `Leonidas ${state.currentVersion} is the newest version.`,
      });
    } else if (state.status === "error") {
      toastManager.add({
        type: "error",
        title: "Could not check for updates",
        ...userErrorToastFields(state.message ?? "Update check failed.", { area: "update" }),
      });
    }
  };
  unsubscribe = shell.onUpdateState(finish);
  if (finished) unsubscribe();
  try {
    const result = await shell.checkForUpdate();
    if (result.checked) finish(result.state);
    else {
      finished = true;
      unsubscribe();
    }
    return result;
  } catch (error) {
    finished = true;
    unsubscribe();
    throw error;
  }
}

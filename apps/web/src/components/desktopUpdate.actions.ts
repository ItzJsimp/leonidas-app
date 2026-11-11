import { ensureLocalApi } from "../localApi";
import { userErrorToastFields } from "~/lib/userErrorToast";
import { getDesktopUpdateActionError, INSTALLER_URL } from "./desktopUpdate.logic";
import { stackedThreadToast, toastManager } from "./ui/toast";

const INSTALL_FALLBACK = "Check your internet connection. Or download the latest installer.";

function toastInstallError(description: string) {
  const toastId = toastManager.add(
    stackedThreadToast({
      type: "error",
      title: "Could not install the update",
      description,
      actionProps: {
        children: "Try again",
        onClick: () => {
          toastManager.close(toastId);
          void installDesktopUpdate();
        },
      },
      data: {
        secondaryActionProps: {
          children: "Download installer",
          onClick: () => {
            toastManager.close(toastId);
            void ensureLocalApi().shell.openExternal(INSTALLER_URL);
          },
        },
      },
    }),
  );
}

/** Restarts into the downloaded update. Failures show a toast because the person asked for this or an install failed. */
export async function installDesktopUpdate(): Promise<void> {
  try {
    const result = await window.desktopBridge?.installUpdate();
    const actionError = result ? getDesktopUpdateActionError(result) : null;
    if (actionError) toastInstallError(actionError);
  } catch (error) {
    toastInstallError(error instanceof Error ? error.message : INSTALL_FALLBACK);
  }
}

/** Starts the download again after a failure. */
export async function retryDesktopUpdateDownload(): Promise<void> {
  try {
    const result = await window.desktopBridge?.downloadUpdate();
    const actionError = result ? getDesktopUpdateActionError(result) : null;
    if (actionError) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not download the update",
          description: actionError,
        }),
      );
    }
  } catch (error) {
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: "Could not start update download",
        ...userErrorToastFields(error),
      }),
    );
  }
}

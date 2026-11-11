import type { DesktopAppBranding } from "@t3tools/contracts";
import { formatAppDisplayName } from "./branding.logic";

function readInjectedDesktopAppBranding(): DesktopAppBranding | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.desktopBridge?.getAppBranding?.() ?? null;
}

const injectedDesktopAppBranding = readInjectedDesktopAppBranding();
const hostedAppChannel = import.meta.env.VITE_HOSTED_APP_CHANNEL?.trim().toLowerCase();

export const HOSTED_APP_CHANNEL =
  hostedAppChannel === "latest" || hostedAppChannel === "nightly" ? hostedAppChannel : null;
export const HOSTED_APP_CHANNEL_LABEL =
  HOSTED_APP_CHANNEL === "nightly" ? "Nightly" : HOSTED_APP_CHANNEL === "latest" ? "Latest" : null;
export const APP_BASE_NAME = injectedDesktopAppBranding?.baseName ?? "Leonidas";
export const APP_STAGE_LABEL =
  injectedDesktopAppBranding?.stageLabel ??
  HOSTED_APP_CHANNEL_LABEL ??
  (import.meta.env.DEV ? "Dev" : "Beta");
export const APP_DISPLAY_NAME =
  injectedDesktopAppBranding?.displayName ??
  formatAppDisplayName({ baseName: APP_BASE_NAME, stageLabel: APP_STAGE_LABEL });
/**
 * The name people read: window title, start page, pairing screens. `APP_BASE_NAME` stays the app
 * identity (user data folders, OS names) until the identity rename ships with a data migration.
 */
export const APP_PRODUCT_NAME = "Leonidas";
export const APP_TITLE = formatAppDisplayName({
  baseName: APP_PRODUCT_NAME,
  stageLabel: APP_STAGE_LABEL,
});
export const APP_VERSION = import.meta.env.APP_VERSION || "0.0.0";
/**
 * What people see as "the version". Equals `APP_VERSION` in installed builds; a dev copy shows the
 * release it is based on plus newer changes. Keep using `APP_VERSION` for server compatibility
 * checks, because this label is not a real release number.
 */
export const APP_VERSION_LABEL = import.meta.env.LEONIDAS_VERSION_LABEL || APP_VERSION;
export const DESKTOP_DOWNLOAD_URL = "https://t3.codes/download";

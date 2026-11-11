import {
  describeUserError,
  type DescribeUserErrorOptions,
  type UserError,
} from "@t3tools/shared/userError";

import { recordFeedbackError } from "../components/feedback/feedbackContext";
import { toastManager } from "../components/ui/toast";
import { writeTextToClipboard } from "../hooks/useCopyToClipboard";
import { ensureLocalApi } from "../localApi";

export interface UserErrorToastOptions extends Omit<DescribeUserErrorOptions, "platform"> {
  /** Runs the failed step again; turns a retryable error's action into "Try again". */
  readonly onRetry?: () => void;
}

export interface UserErrorToastFields {
  readonly description: string;
  readonly actionProps: { readonly children: string; readonly onClick: () => void };
  readonly data: { readonly copyText: string; readonly hideCopyButton?: boolean };
}

let navigateTo: ((to: string) => void) | null = null;

/** main.tsx registers the router once, so a toast action can open a settings page. */
export function registerUserErrorNavigator(navigate: (to: string) => void): void {
  navigateTo = navigate;
}

function detectPlatform(): DescribeUserErrorOptions["platform"] {
  const platform = (
    typeof navigator === "undefined" ? "" : (navigator.platform ?? "")
  ).toLowerCase();
  if (platform.includes("mac")) return "mac";
  if (platform.includes("linux")) return "linux";
  return "windows";
}

function reportActionFailure(cause: unknown): void {
  console.error("[user-error] The recovery action failed.", cause);
}

/** Runs the one recovery action. A failed action is logged, never thrown. */
export function runUserErrorAction(userError: UserError, onRetry?: () => void): void {
  const { action } = userError;
  switch (action.kind) {
    case "retry":
      if (onRetry) onRetry();
      else window.location.reload();
      return;
    case "reload":
      window.location.reload();
      return;
    case "route":
      if (navigateTo) navigateTo(action.to);
      else reportActionFailure(new Error(`No navigator registered for ${action.to}.`));
      return;
    case "url":
      void ensureLocalApi().shell.openExternal(action.url).catch(reportActionFailure);
      return;
    case "command":
      void writeTextToClipboard(action.command, "Command").catch(reportActionFailure);
      return;
    case "copy-details":
      void writeTextToClipboard(userError.detail, "Error details").catch(reportActionFailure);
      return;
  }
}

/**
 * Toast fields for a failed step: the reason as the description, one action
 * button, and the full detail behind the copy button. Logs the full error.
 */
export function userErrorToastFields(
  error: unknown,
  options: UserErrorToastOptions = {},
): UserErrorToastFields {
  const { onRetry, ...describeOptions } = options;
  const platform = detectPlatform();
  const userError = describeUserError(error, {
    ...describeOptions,
    canRetry: describeOptions.canRetry ?? onRetry !== undefined,
    ...(platform ? { platform } : {}),
  });
  console.error(`[user-error:${userError.kind}]`, error);
  recordFeedbackError(userError.detail);
  return {
    description: userError.reason,
    actionProps: {
      children: userError.action.label,
      onClick: () => runUserErrorAction(userError, onRetry),
    },
    data:
      userError.action.kind === "copy-details"
        ? { copyText: userError.detail, hideCopyButton: true }
        : { copyText: userError.detail },
  };
}

/**
 * A rejected promise that no caller handled is otherwise silent. Toast it when
 * it matches a known class; unknown rejections stay in the console only.
 */
export function installUnhandledRejectionToasts(): () => void {
  const onRejection = (event: PromiseRejectionEvent) => {
    if (describeUserError(event.reason).kind === "unknown") return;
    toastManager.add({
      type: "error",
      title: "A background step failed.",
      ...userErrorToastFields(event.reason),
    });
  };
  window.addEventListener("unhandledrejection", onRejection);
  return () => window.removeEventListener("unhandledrejection", onRejection);
}

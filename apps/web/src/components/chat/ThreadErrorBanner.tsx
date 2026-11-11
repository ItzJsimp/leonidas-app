import type { OrchestrationV2ProviderFailureClass } from "@t3tools/contracts";
import { describeUserError } from "@t3tools/shared/userError";
import { memo, useEffect, useMemo } from "react";
import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { toastManager } from "../ui/toast";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { recordFeedbackError } from "../feedback/feedbackContext";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { CircleAlertIcon, XIcon } from "lucide-react";
import { OpenAI } from "../Icons";
import { ChatGptUsageButton } from "../settings/ChatGptUsageButton";
import { runUserErrorAction, userErrorToastFields } from "~/lib/userErrorToast";

export function getThreadErrorBannerKey(threadKey: string, error: string | null): string | null {
  return error === null ? null : `${threadKey}\u0000${error}`;
}

export function shouldShowThreadErrorBanner(
  threadKey: string,
  error: string | null,
  isDismissed: boolean,
): boolean {
  return getThreadErrorBannerKey(threadKey, error) !== null && !isDismissed;
}

const CAUSE_SEPARATOR = " Caused by: ";

/** The server joins the nested causes of a failure with "Caused by:"; one line per link. */
function splitErrorCauseChain(error: string): string[] {
  return error.includes(CAUSE_SEPARATOR) ? error.split(CAUSE_SEPARATOR) : [];
}

function ThreadErrorDetails({ error }: { error: string }) {
  const chain = splitErrorCauseChain(error);
  const lines = chain.length === 0 ? [error] : chain;
  return (
    <Collapsible className="mt-1">
      <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground">
        View details
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="mt-1 flex items-start gap-2">
          <pre
            data-testid="thread-error-details"
            className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs"
          >
            {lines.map((line, index) => (index === 0 ? line : `Caused by: ${line}`)).join("\n")}
          </pre>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              void writeTextToClipboard(error, "Error details").catch((copyError: unknown) => {
                toastManager.add({
                  type: "error",
                  title: "Could not copy error details",
                  ...userErrorToastFields(copyError),
                });
              });
            }}
          >
            Copy
          </Button>
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

// Session-scoped (module-level so it survives ChatView remounts, e.g. route
// changes between threads). Mirrors the branch-mismatch banner: a dismissal
// is remembered per thread key plus message, so navigating away to a thread
// with no error cannot resurrect the banner, while a different error message
// on the same thread still appears.
const sessionDismissedThreadErrorBannerKeys = new Set<string>();

export function dismissThreadErrorBannerForSession(bannerKey: string | null): void {
  if (bannerKey !== null) {
    sessionDismissedThreadErrorBannerKeys.add(bannerKey);
  }
}

export function isThreadErrorBannerDismissedForSession(bannerKey: string | null): boolean {
  return bannerKey !== null && sessionDismissedThreadErrorBannerKeys.has(bannerKey);
}

export const ThreadErrorBanner = memo(function ThreadErrorBanner({
  error,
  onDismiss,
  errorClass,
  chatGptUsageLimit = false,
}: {
  error: string | null;
  errorClass?: OrchestrationV2ProviderFailureClass | null;
  onDismiss?: () => void;
  chatGptUsageLimit?: boolean;
}) {
  useEffect(() => {
    if (error) recordFeedbackError(error);
  }, [error]);
  const userError = useMemo(
    () => (error ? describeUserError(error, { providerClass: errorClass ?? null }) : null),
    [error, errorClass],
  );
  if (!error || !userError) return null;
  const variant = errorClass === "usage_limit" ? "warning" : "error";
  return (
    <div
      data-feedback-error
      className="pointer-events-auto mx-auto w-fit max-w-[min(48rem,calc(100%-2rem))] pt-3"
    >
      <Alert variant={variant} surface="glass" controlAlignment="first-line" data-variant={variant}>
        {chatGptUsageLimit ? (
          <OpenAI className="size-4 text-foreground!" aria-hidden="true" />
        ) : (
          <CircleAlertIcon />
        )}
        <AlertDescription>
          {chatGptUsageLimit ? (
            <div className="space-y-1">
              <p className="font-medium">You used all of your ChatGPT limit</p>
              <p>Open your usage settings in ChatGPT to continue.</p>
            </div>
          ) : (
            <div className="space-y-1" data-testid="thread-error-summary">
              <p className="font-medium">{userError.title}</p>
              <p>{userError.reason}</p>
            </div>
          )}
          {chatGptUsageLimit ? null : <ThreadErrorDetails error={error} />}
        </AlertDescription>
        <AlertAction>
          {chatGptUsageLimit ? (
            <ChatGptUsageButton variant="default" size="sm" />
          ) : (
            <Button
              variant="outline"
              size="sm"
              data-testid="thread-error-action"
              onClick={() => runUserErrorAction(userError)}
            >
              {userError.action.label}
            </Button>
          )}
          {onDismiss ? (
            <Button variant="ghost" size="icon-xs" aria-label="Dismiss error" onClick={onDismiss}>
              <XIcon />
            </Button>
          ) : null}
        </AlertAction>
      </Alert>
    </div>
  );
});

export function getThreadErrorBannerMessage(error: string): string {
  let payload: unknown;
  try {
    payload = JSON.parse(error);
  } catch {
    return error;
  }
  if (typeof payload !== "object" || payload === null || !("error" in payload)) {
    return error;
  }
  const nestedError = payload.error;
  if (typeof nestedError !== "object" || nestedError === null || !("message" in nestedError)) {
    return error;
  }
  return typeof nestedError.message === "string" && nestedError.message.trim().length > 0
    ? nestedError.message
    : error;
}

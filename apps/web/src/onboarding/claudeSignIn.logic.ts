import type { ProviderAuthState, ProviderInstallState } from "@t3tools/contracts";

export const CLAUDE_WAITING_MESSAGE =
  "In your browser, sign in, then click Authorize. Leonidas comes back by itself.";
export const CLAUDE_FINISHING_MESSAGE = "Finishing sign-in...";
export const CLAUDE_FAILED_FALLBACK_MESSAGE = "Claude sign-in did not finish. Try again.";

export type ClaudeSignInView =
  | { readonly kind: "idle" }
  | {
      readonly kind: "waiting";
      /** The sign-in page Claude printed. Null until it appears. */
      readonly url: string | null;
      /** Only the client that started the sign-in can cancel it. */
      readonly canCancel: boolean;
    }
  | { readonly kind: "finishing" }
  | { readonly kind: "failed"; readonly message: string };

/**
 * Choose what the Claude card shows while the provider needs a sign-in.
 * `requested` is true after this client asked to sign in, so an old finished
 * attempt does not show on a new visit.
 */
export function getClaudeSignInView(input: {
  readonly auth: ProviderAuthState | null | undefined;
  readonly requested: boolean;
}): ClaudeSignInView {
  const { auth, requested } = input;
  const phase = auth?.phase ?? "idle";
  if (phase === "starting" || phase === "waiting") {
    const url =
      auth?.interaction?.type === "browser"
        ? auth.interaction.url
        : (auth?.authorizationUrl ?? null);
    return { kind: "waiting", url, canCancel: auth?.flowId != null };
  }
  if (phase === "verifying") return { kind: "finishing" };
  if (!requested) return { kind: "idle" };
  if (phase === "succeeded") return { kind: "finishing" };
  if (phase === "failed") {
    return { kind: "failed", message: auth?.message?.trim() || CLAUDE_FAILED_FALLBACK_MESSAGE };
  }
  if (phase === "cancelled") return { kind: "idle" };
  // The start call returned, but the first state has not arrived yet.
  return { kind: "waiting", url: null, canCancel: false };
}

export const CLAUDE_INSTALL_PROMPT =
  "Claude is not on this computer yet. Install it for free, then sign in.";
export const CLAUDE_INSTALLED_ELSEWHERE_MESSAGE =
  "Claude is installed, but this account uses a different program path. Open its Settings and clear Binary path.";
export const CLAUDE_INSTALLING_MESSAGE =
  "Installing Claude. This takes about 1 minute. You can continue: setup keeps going.";
/** The install message with a running clock, so a slow download never looks frozen. */
export function describeClaudeInstalling(elapsedSeconds: number): string {
  if (elapsedSeconds < 1) return CLAUDE_INSTALLING_MESSAGE;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = Math.floor(elapsedSeconds % 60);
  const clock = minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`;
  return `${CLAUDE_INSTALLING_MESSAGE} Time so far: ${clock}.`;
}

export const CLAUDE_INSTALL_FAILED_FALLBACK =
  "Could not install Claude. Check your internet connection, then try again.";

export type ClaudeInstallView =
  | { readonly kind: "idle" }
  | { readonly kind: "installing"; readonly operationId: string | null }
  | { readonly kind: "installed" }
  | { readonly kind: "failed"; readonly message: string };

/**
 * Choose what the Claude card shows while Claude is not installed.
 * `requested` hides an old failed attempt on a new visit.
 */
export function getClaudeInstallView(input: {
  readonly installation: ProviderInstallState | null | undefined;
  readonly requested: boolean;
}): ClaudeInstallView {
  const { installation, requested } = input;
  const phase = installation?.phase ?? "idle";
  if (phase === "downloading" || phase === "extracting" || phase === "verifying") {
    return { kind: "installing", operationId: installation?.operationId ?? null };
  }
  if (phase === "succeeded") return { kind: "installed" };
  if (requested && (phase === "failed" || phase === "cancelled")) {
    return {
      kind: "failed",
      message:
        phase === "cancelled"
          ? "Installation cancelled."
          : (installation?.message ?? CLAUDE_INSTALL_FAILED_FALLBACK),
    };
  }
  return { kind: "idle" };
}

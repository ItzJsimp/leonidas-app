import { deriveAvailableInstanceId } from "./AddProviderInstanceDialog.logic";

export type ConnectChoice = "claude" | "chatgpt" | "google";

export interface ConnectChoiceInfo {
  readonly id: ConnectChoice;
  readonly title: string;
  readonly plans: string;
  readonly driver: string;
}

export const CONNECT_CHOICES: ReadonlyArray<ConnectChoiceInfo> = [
  { id: "claude", title: "Claude", plans: "Pro, Max or Team plan", driver: "claudeAgent" },
  { id: "chatgpt", title: "ChatGPT", plans: "Plus, Pro or Team plan", driver: "codex" },
  { id: "google", title: "Google Gemini", plans: "Any Google account", driver: "antigravity" },
];

/**
 * True when a new account shows the same email as another account of the same
 * service. A new account has its own config folder, so it cannot have the same
 * login unless the login lives outside that folder (an env token, or an old
 * Claude CLI that shares one keychain entry). That is not a real sign-in.
 */
export function sharesLoginWithOtherAccount(
  account: { readonly instanceId: string; readonly email?: string | undefined },
  others: ReadonlyArray<{ readonly instanceId: string; readonly email?: string | undefined }>,
): boolean {
  const email = account.email?.trim().toLowerCase();
  if (!email) return false;
  return others.some(
    (other) =>
      other.instanceId !== account.instanceId && other.email?.trim().toLowerCase() === email,
  );
}

/**
 * Plan for a one-click account. The first Claude or Google account reuses the
 * machine's default sign-in. Later accounts get their own config folder so two
 * accounts never share one login.
 */
export function planQuickConnect(input: {
  readonly choice: Exclude<ConnectChoice, "chatgpt">;
  readonly existingIds: ReadonlySet<string>;
  readonly sameDriverCount: number;
}): {
  readonly instanceId: string;
  readonly displayName: string;
  readonly config: Record<string, unknown> | undefined;
} {
  const info = CONNECT_CHOICES.find((entry) => entry.id === input.choice)!;
  const ordinal = input.sameDriverCount + 1;
  const displayName = ordinal === 1 ? info.title : `${info.title} ${ordinal}`;
  const instanceId = deriveAvailableInstanceId(
    () => (ordinal === 1 ? info.driver : `${info.driver}_${ordinal}`),
    displayName,
    input.existingIds,
  );
  const config =
    input.choice === "claude" && input.sameDriverCount > 0
      ? { homePath: `~/.claude-${instanceId}` }
      : undefined;
  return { instanceId, displayName, config };
}

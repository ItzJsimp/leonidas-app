import { APP_VERSION } from "../../branding";
import {
  getFeedbackActiveModel,
  getFeedbackLastError,
} from "../../components/feedback/feedbackContext";
import { COMMUNITY_URL } from "../../components/feedback/feedbackRelay";
import { makeHexId, useUsageAnalyticsStore } from "../usageAnalytics/usageAnalyticsStore";

/**
 * The only fields an "I'm stuck" report may carry. Each one is a short code from the app, never
 * text the user typed: no message, no path, no key, no screenshot. The Worker checks the same
 * shapes again (services/feedback-relay/src/community.ts).
 */
export interface StuckReport {
  readonly reportId: string;
  readonly appVersion: string;
  readonly platform: string;
  readonly screen: string;
  readonly lastAction: string;
  readonly errorCode: string | null;
  readonly provider: string | null;
  readonly source: "button" | "voice";
}

const CODE = /^[A-Za-z0-9._-]{1,40}$/;
const RECENT_ERROR_MS = 10 * 60 * 1000;

let lastAction = "app-opened";

/** Remember what the user did last, as a fixed code such as `message-sent` or `opened-chat`. */
export function recordStuckAction(action: string): void {
  if (CODE.test(action)) lastAction = action;
}

const SCREENS = new Set([
  "brain",
  "command-center",
  "connect",
  "images",
  "pair",
  "projects",
  "pull-requests",
  "scribe",
  "system-care",
  "automations",
  "tasks",
  "usage",
  "welcome",
]);
const SETTINGS_SCREENS = new Set([
  "appearance",
  "archived",
  "connections",
  "diagnostics",
  "general",
  "integrations",
  "keybindings",
  "models",
  "open-source-licenses",
  "projects",
  "providers",
  "scheduled-tasks",
  "snap-shot",
  "source-control",
  "storage",
]);

/** Names the screen from a fixed list of app routes. Ids, folder names and anything else never pass. */
export function screenFromPath(pathname: string): string {
  const [first = "", second = ""] = pathname.toLowerCase().split("/").filter(Boolean);
  if (first === "") return "home";
  if (first === "settings") return SETTINGS_SCREENS.has(second) ? `settings/${second}` : "settings";
  if (SCREENS.has(first)) return first;
  // Chat routes are `/<environment id>/<thread id>`: the ids stay out of the report.
  return second === "" ? "other" : "chat";
}

const ERROR_CODES: ReadonlyArray<readonly [RegExp, string]> = [
  [/rate.?limit|quota|usage limit|\b429\b/i, "rate_limited"],
  [/unauthori[sz]ed|forbidden|api key|auth|\b40[13]\b/i, "auth_failed"],
  [/timed? ?out|timeout/i, "timeout"],
  [/econn|enotfound|network|unreachable|fetch failed|offline/i, "provider_unreachable"],
  [/typeerror|referenceerror|unhandled|cannot read|is not a function/i, "app_error"],
];

/** Turns an error message into a fixed code. The message itself never leaves the app. */
export function errorCodeFromText(text: string | null): string | null {
  if (!text) return null;
  return ERROR_CODES.find(([pattern]) => pattern.test(text))?.[1] ?? "unknown_error";
}

function platformCode(): string {
  const agent = globalThis.navigator?.userAgent ?? "";
  return /Windows/i.test(agent) ? "win32" : /Mac/i.test(agent) ? "darwin" : "linux";
}

export function buildStuckReport(input: {
  readonly pathname: string;
  readonly source: StuckReport["source"];
  readonly reportId?: string;
  readonly now?: number;
}): StuckReport {
  const error = getFeedbackLastError();
  const recent = error && (input.now ?? Date.now()) - error.at < RECENT_ERROR_MS;
  const provider = getFeedbackActiveModel()?.provider ?? null;
  return {
    reportId: input.reportId ?? makeHexId(),
    appVersion: APP_VERSION,
    platform: platformCode(),
    screen: screenFromPath(input.pathname),
    lastAction,
    errorCode: recent ? errorCodeFromText(error.text) : null,
    provider: provider !== null && CODE.test(provider) ? provider : null,
    source: input.source,
  };
}

/** True when the whole message is the spoken phrase, with or without punctuation. */
export function isStuckPhrase(text: string): boolean {
  const spoken = text
    .toLowerCase()
    .replace(/[^a-z' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(hey )?leonidas (i'?m|i am) stuck$/.test(spoken);
}

export type StuckSendResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

export async function sendStuckReport(report: StuckReport): Promise<StuckSendResult> {
  if (!COMMUNITY_URL) return { ok: false, error: "Reports are not connected in this build yet." };
  try {
    const response = await fetch(`${COMMUNITY_URL}/stuck`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
    });
    if (response.status === 429) return { ok: false, error: "Too many reports. Try again later." };
    if (!response.ok) return { ok: false, error: `Could not send (${response.status}).` };
    useUsageAnalyticsStore.getState().addStuckReport(report.reportId);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach the service. Check your connection." };
  }
}

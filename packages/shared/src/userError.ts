/**
 * The one source of plain error text and recovery actions.
 *
 * Every user-facing error says what happened (the caller's title or
 * `UserError.title`), why (`UserError.reason`, one clause) and offers one
 * action (`UserError.action`). The full error goes to `UserError.detail` for
 * logs and the "Copy details" button; it never replaces the short form.
 */

export type UserErrorKind =
  | "provider-cli-missing"
  | "auth-expired"
  | "no-paid-plan"
  | "quota-reached"
  | "port-in-use"
  | "settings-corrupt"
  | "update-download-failed"
  | "server-down"
  | "network-down"
  | "unknown";

export type UserErrorAction =
  | { readonly kind: "retry"; readonly label: string }
  | { readonly kind: "reload"; readonly label: string }
  | { readonly kind: "route"; readonly label: string; readonly to: string }
  | { readonly kind: "url"; readonly label: string; readonly url: string }
  | { readonly kind: "command"; readonly label: string; readonly command: string }
  | { readonly kind: "copy-details"; readonly label: string };

export interface UserError {
  readonly kind: UserErrorKind;
  /** What happened, used when the caller has no title of its own. */
  readonly title: string;
  /** Why it happened, in one clause. */
  readonly reason: string;
  /** The one action that fixes it. */
  readonly action: UserErrorAction;
  /** The full, redacted error text for logs and "Copy details". */
  readonly detail: string;
}

/** The provider failure class the server attaches to a thread error. */
export type ProviderFailureClassHint =
  | "usage_limit"
  | "provider_error"
  | "transport_error"
  | "permission_error"
  | "validation_error"
  | "unknown";

export interface DescribeUserErrorOptions {
  /** Set when the caller can run the failed step again. */
  readonly canRetry?: boolean;
  /** The failure class from the server, when known. */
  readonly providerClass?: ProviderFailureClassHint | null;
  /** Set by the updater so any failure there reads as an update failure. */
  readonly area?: "update";
  readonly platform?: "windows" | "mac" | "linux";
}

export const PROVIDER_SETTINGS_ROUTE = "/settings/providers";
export const GENERAL_SETTINGS_ROUTE = "/settings/general";
export const INSTALLER_DOWNLOAD_URL =
  "https://github.com/ItzJsimp/leonidas-app/releases/latest/download/Leonidas-Setup.exe";

const RETRY: UserErrorAction = { kind: "retry", label: "Try again" };
const RELOAD: UserErrorAction = { kind: "reload", label: "Reload" };
const COPY_DETAILS: UserErrorAction = { kind: "copy-details", label: "Copy details" };

interface ErrorFacts {
  readonly text: string;
  readonly tags: ReadonlySet<string>;
  readonly codes: ReadonlySet<string>;
  readonly status: number | null;
  readonly settingsPath: string | null;
}

const MAX_CAUSE_DEPTH = 8;

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  const record = readRecord(value);
  if (record && typeof record.message === "string") return record.message;
  return "";
}

/** Walks the error and its causes once and keeps the parts the classifier reads. */
function collectFacts(error: unknown): ErrorFacts {
  const texts: string[] = [];
  const tags = new Set<string>();
  const codes = new Set<string>();
  let status: number | null = null;
  let settingsPath: string | null = null;
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current != null; depth += 1) {
    const message = readMessage(current);
    if (message) texts.push(message);
    const record = readRecord(current);
    if (!record) break;
    if (typeof record._tag === "string") tags.add(record._tag);
    if (typeof record.code === "string") codes.add(record.code.toUpperCase());
    if (status === null && typeof record.status === "number") status = record.status;
    if (settingsPath === null && typeof record.settingsPath === "string") {
      settingsPath = record.settingsPath;
    }
    current = record.cause;
  }
  return { text: texts.join("\n").toLowerCase(), tags, codes, status, settingsPath };
}

const CLI_MISSING =
  /spawn \S+ enoent|command not found|is not recognized as an internal or external command|executable (was )?not found|cli (is )?not installed|(claude|codex|gemini|cursor|opencode|antigravity)( cli| code)? (is )?not installed|could not find the (claude|codex|gemini|cursor|opencode) (cli|binary|executable)/;
const AUTH_EXPIRED =
  /unauthori[sz]ed|not logged in|not signed in|please (log|sign) ?in|login required|authentication (failed|required|expired)|(token|session|credentials?) (has )?(expired|invalid|revoked)|invalid (api key|token)|re-?authenticate|oauth token/;
const NO_PAID_PLAN =
  /(pro|max|plus|team|paid) (plan|subscription) (is )?required|requires an? (claude |chatgpt )?(pro|max|plus|paid)|subscription required|does not have access to (claude code|codex)|plan does not include|upgrade your plan|not (included|available) (in|on|with) your plan/;
const QUOTA_REACHED =
  /usage limit|rate.?limit|quota|too many requests|credit balance|out of credits|limit (reached|exceeded)/;
const PORT_IN_USE = /eaddrinuse|address already in use|port (\d+ )?is (already )?in use/;
const PORT_NUMBER = /(?:port|:)\s*(\d{2,5})\b/;
const SETTINGS_CORRUPT =
  /settings[^\n]*(parse|json|decode|invalid|corrupt)|(parse|decode)[^\n]*settings/;
const UPDATE_FAILED =
  /err_updater|latest(-mac)?\.yml|sha512 checksum mismatch|(download|install)(ing)? (the )?update|update (download|install) failed/;
const NETWORK_DOWN =
  /failed to fetch|networkerror|network error|fetch failed|socket hang up|websocket (is )?(closed|disconnected)|connection (refused|reset|closed)|timed? ?out|offline/;
const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EPIPE",
]);
const SERVER_DOWN_STATUS = new Set([502, 503, 504]);

function classify(facts: ErrorFacts, options: DescribeUserErrorOptions): UserErrorKind {
  const { text, tags, codes, status } = facts;
  if (options.area === "update" || UPDATE_FAILED.test(text)) return "update-download-failed";
  if (tags.has("ServerSettingsError") || SETTINGS_CORRUPT.test(text)) return "settings-corrupt";
  if (codes.has("EADDRINUSE") || PORT_IN_USE.test(text)) return "port-in-use";
  if (CLI_MISSING.test(text)) return "provider-cli-missing";
  if (NO_PAID_PLAN.test(text)) return "no-paid-plan";
  if (options.providerClass === "usage_limit" || status === 429 || QUOTA_REACHED.test(text)) {
    return "quota-reached";
  }
  if (status === 401 || AUTH_EXPIRED.test(text)) return "auth-expired";
  if (status !== null && SERVER_DOWN_STATUS.has(status)) return "server-down";
  if (
    options.providerClass === "transport_error" ||
    [...codes].some((code) => NETWORK_CODES.has(code)) ||
    NETWORK_DOWN.test(text)
  ) {
    return "network-down";
  }
  return "unknown";
}

function portFreeCommand(port: string, platform: DescribeUserErrorOptions["platform"]): string {
  return platform === "mac" || platform === "linux"
    ? `lsof -i :${port}`
    : `netstat -ano | findstr :${port}`;
}

function buildUserError(
  kind: UserErrorKind,
  facts: ErrorFacts,
  options: DescribeUserErrorOptions,
  detail: string,
): UserError {
  switch (kind) {
    case "provider-cli-missing":
      return {
        kind,
        detail,
        title: "The AI program is not installed.",
        reason:
          "Leonidas could not find the AI program on this computer. Install it from the AI accounts page.",
        action: { kind: "route", label: "Install it", to: PROVIDER_SETTINGS_ROUTE },
      };
    case "auth-expired":
      return {
        kind,
        detail,
        title: "You are signed out of this AI account.",
        reason: "The sign-in expired or was removed. Sign in again to keep chatting.",
        action: { kind: "route", label: "Sign in again", to: PROVIDER_SETTINGS_ROUTE },
      };
    case "no-paid-plan":
      return {
        kind,
        detail,
        title: "This AI account has no paid plan.",
        reason:
          "This AI needs a paid plan (about $20 a month). To start free, sign in with OpenRouter.",
        action: { kind: "route", label: "Start free", to: PROVIDER_SETTINGS_ROUTE },
      };
    case "quota-reached":
      return {
        kind,
        detail,
        title: "This AI account reached its limit.",
        reason:
          "It used all of its allowance for now. Wait and try again later, or pick another AI in the model menu.",
        action: { kind: "route", label: "View usage", to: PROVIDER_SETTINGS_ROUTE },
      };
    case "port-in-use": {
      const port = PORT_NUMBER.exec(facts.text)?.[1];
      return {
        kind,
        detail,
        title: "The port is already in use.",
        reason: port
          ? `Another program already uses port ${port}.`
          : "Another program already uses the port.",
        action: port
          ? {
              kind: "command",
              label: "Copy command to find it",
              command: portFreeCommand(port, options.platform),
            }
          : COPY_DETAILS,
      };
    }
    case "settings-corrupt":
      return {
        kind,
        detail,
        title: "The settings could not be read.",
        reason: facts.settingsPath
          ? `The settings file at ${facts.settingsPath} is damaged or has a wrong value.`
          : "The settings file is damaged or has a wrong value.",
        action: { kind: "route", label: "Open settings", to: GENERAL_SETTINGS_ROUTE },
      };
    case "update-download-failed":
      return {
        kind,
        detail,
        title: "The update did not download.",
        reason: "Leonidas could not get the update from the update server.",
        action: options.canRetry
          ? RETRY
          : { kind: "url", label: "Download installer", url: INSTALLER_DOWNLOAD_URL },
      };
    case "server-down":
      return {
        kind,
        detail,
        title: "Leonidas cannot reach its server.",
        reason: `The server answered HTTP ${facts.status ?? "5xx"}, so it is starting or stopped.`,
        action: options.canRetry ? RETRY : RELOAD,
      };
    case "network-down":
      return {
        kind,
        detail,
        title: "The connection dropped.",
        reason: "Leonidas lost its network connection to the server or provider.",
        action: options.canRetry ? RETRY : RELOAD,
      };
    case "unknown":
      return {
        kind,
        detail,
        title: "Something went wrong.",
        reason: "An unexpected error stopped this action.",
        action: options.canRetry ? RETRY : COPY_DETAILS,
      };
  }
}

const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(bearer|token|authorization|api[_-]?key)(["']?\s*[:=]\s*["']?|\s+)(?:bearer\s+)?[^\s"',;]+/gi,
  /\bsk-[a-z0-9_-]{8,}/gi,
  /\bgh[pousr]_[a-z0-9]{16,}/gi,
];

export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce(
    (current, pattern) =>
      current.replace(pattern, (match, label?: string, separator?: string) =>
        typeof label === "string" && typeof separator === "string"
          ? `${label}${separator}<REDACTED>`
          : "<REDACTED>",
      ),
    text,
  );
}

/** The full error text: message, tag, code, stack and every cause, secrets removed. */
export function formatErrorDetail(error: unknown): string {
  const lines: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current != null; depth += 1) {
    const record = readRecord(current);
    const prefix = depth === 0 ? "" : "Caused by: ";
    if (!record) {
      lines.push(`${prefix}${String(current)}`);
      break;
    }
    const label = [record._tag, record.name, record.code]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .filter((part, index, parts) => parts.indexOf(part) === index)
      .join(" ");
    const message = readMessage(current);
    lines.push(`${prefix}${label ? `${label}: ` : ""}${message || "(no message)"}`);
    if (typeof record.stack === "string" && record.stack.length > 0) {
      lines.push(record.stack.split("\n").slice(1).join("\n"));
    }
    current = record.cause;
  }
  return redactSecrets(lines.filter((line) => line.length > 0).join("\n"));
}

/** Classifies any thrown value, rejection, or server error string. */
export function describeUserError(
  error: unknown,
  options: DescribeUserErrorOptions = {},
): UserError {
  const facts = collectFacts(error);
  return buildUserError(classify(facts, options), facts, options, formatErrorDetail(error));
}

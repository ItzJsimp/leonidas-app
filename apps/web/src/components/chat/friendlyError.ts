const GENERIC = "Something went wrong. Copy the details and try again.";

const KNOWN_CAUSES: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /fetch failed|network|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|timed out/i,
    "Leonidas could not reach the network. Check your internet connection and try again.",
  ],
  [
    /EACCES|EPERM|permission denied/i,
    "Leonidas does not have permission to do this. Check the folder or file permissions.",
  ],
  [/ENOENT|no such file/i, "Leonidas could not find that file or folder."],
  [/\b429\b|rate.?limit/i, "Too many requests. Wait a short time and try again."],
  [/\b401\b|unauthori[sz]ed|not signed in/i, "You are not signed in. Sign in and try again."],
];

function rawErrorText(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  if (typeof error === "string") return error.trim();
  return "";
}

/** One plain sentence for a failed action. Unknown causes keep their own message. */
export function friendlyErrorMessage(error: unknown): string {
  const raw = rawErrorText(error);
  if (raw.length === 0) return GENERIC;
  for (const [pattern, sentence] of KNOWN_CAUSES) {
    if (pattern.test(raw)) return sentence;
  }
  return raw;
}

/** Full technical text for the "Copy details" action. */
export function friendlyErrorDetails(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`;
  const raw = rawErrorText(error);
  if (raw.length > 0) return raw;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

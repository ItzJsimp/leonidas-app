const SERVER_DOWN_STATUS_CODES = new Set([502, 503, 504]);

export interface RootErrorHint {
  readonly title: string;
  readonly description: string;
  /** True when the screen should keep retrying by itself until the server answers. */
  readonly autoRetry: boolean;
}

/** Reads the HTTP status off a request error without importing the Effect error class. */
function readStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const record = error as { readonly _tag?: unknown; readonly status?: unknown };
  if (record._tag !== "PrimaryEnvironmentRequestError") return null;
  return typeof record.status === "number" ? record.status : null;
}

/**
 * A 502, 503 or 504 from the first session request means the server behind the
 * app is down or restarting. Say so in plain words instead of a generic crash.
 */
export function resolveRootErrorHint(
  error: unknown,
  online: boolean = typeof navigator === "undefined" || navigator.onLine !== false,
): RootErrorHint | null {
  // With no network every request fails, so the cause is the device, not the server.
  if (!online) {
    return {
      title: "This device is offline.",
      description:
        "Connect to Wi-Fi or mobile data. Leonidas tries again by itself every 3 seconds.",
      autoRetry: true,
    };
  }
  const status = readStatus(error);
  if (status === null || !SERVER_DOWN_STATUS_CODES.has(status)) return null;
  return {
    title: "Leonidas cannot reach its server.",
    description: `The server answered HTTP ${status}. It may be starting, or it stopped. This screen retries by itself every 3 seconds. In a dev copy, run "node scripts/dev-health.mjs" to see which part is down.`,
    autoRetry: true,
  };
}

import { describe, expect, it } from "vite-plus/test";

import {
  describeUserError,
  formatErrorDetail,
  GENERAL_SETTINGS_ROUTE,
  INSTALLER_DOWNLOAD_URL,
  PROVIDER_SETTINGS_ROUTE,
  redactSecrets,
} from "./userError.ts";

function nodeError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

describe("describeUserError", () => {
  it("provider CLI missing: points to provider settings", () => {
    const result = describeUserError(nodeError("spawn claude ENOENT", "ENOENT"));
    expect(result.kind).toBe("provider-cli-missing");
    expect(result.reason).toBe(
      "Leonidas could not find the AI program on this computer. Install it from the AI accounts page.",
    );
    expect(result.action).toEqual({
      kind: "route",
      label: "Install it",
      to: PROVIDER_SETTINGS_ROUTE,
    });
  });

  it("does not read a missing file as a missing CLI", () => {
    const result = describeUserError(nodeError("ENOENT: no such file, open 'a.txt'", "ENOENT"));
    expect(result.kind).toBe("unknown");
  });

  it("auth expired: asks the user to sign in again", () => {
    const result = describeUserError({
      _tag: "RequestError",
      status: 401,
      message: "Unauthorized",
    });
    expect(result.kind).toBe("auth-expired");
    expect(result.reason).toBe(
      "The sign-in expired or was removed. Sign in again to keep chatting.",
    );
    expect(result.action).toEqual({
      kind: "route",
      label: "Sign in again",
      to: PROVIDER_SETTINGS_ROUTE,
    });
  });

  it("quota hit: opens usage, from text, status or provider class", () => {
    for (const result of [
      describeUserError(new Error("Claude usage limit reached. Resets at 5pm.")),
      describeUserError({ status: 429, message: "Too many requests" }),
      describeUserError("Turn failed", { providerClass: "usage_limit" }),
    ]) {
      expect(result.kind).toBe("quota-reached");
      expect(result.reason).toBe(
        "It used all of its allowance for now. Wait and try again later, or pick another AI in the model menu.",
      );
      expect(result.action).toEqual({
        kind: "route",
        label: "View usage",
        to: PROVIDER_SETTINGS_ROUTE,
      });
    }
  });

  it("no paid plan: points to the free path before the quota case", () => {
    for (const text of [
      "Claude Code requires a Claude Pro or Max subscription.",
      "Your plan does not include Codex. Upgrade your plan to continue.",
      "This account does not have access to Claude Code.",
    ]) {
      const result = describeUserError(new Error(text));
      expect(result.kind).toBe("no-paid-plan");
      expect(result.reason).toContain("OpenRouter");
      expect(result.action).toEqual({
        kind: "route",
        label: "Start free",
        to: "/settings/providers",
      });
    }
  });

  it("setup failures use plain words, not CLI or provider jargon", () => {
    for (const error of [
      new Error("spawn claude ENOENT"),
      new Error("Not logged in. Please run /login"),
      new Error("rate limit exceeded"),
      new Error("Claude Code requires a Claude Pro subscription"),
    ]) {
      const { title, reason } = describeUserError(error);
      expect(`${title} ${reason}`).not.toMatch(/CLI|provider|command-line/i);
    }
  });

  it("network drop: retries when the caller can, else reloads", () => {
    const error = new TypeError("Failed to fetch");
    expect(describeUserError(error).kind).toBe("network-down");
    expect(describeUserError(error, { canRetry: true }).action).toEqual({
      kind: "retry",
      label: "Try again",
    });
    expect(describeUserError(error).action).toEqual({ kind: "reload", label: "Reload" });
    expect(describeUserError(nodeError("connect", "ECONNREFUSED")).kind).toBe("network-down");
    expect(describeUserError("x", { providerClass: "transport_error" }).kind).toBe("network-down");
  });

  it("server down: names the HTTP status", () => {
    const result = describeUserError({ _tag: "PrimaryEnvironmentRequestError", status: 503 });
    expect(result.kind).toBe("server-down");
    expect(result.reason).toBe("The server answered HTTP 503, so it is starting or stopped.");
    expect(result.action.kind).toBe("reload");
  });

  it("port in use: gives a command that finds the owner", () => {
    const error = nodeError("listen EADDRINUSE: address already in use :::3773", "EADDRINUSE");
    const windows = describeUserError(error);
    expect(windows.kind).toBe("port-in-use");
    expect(windows.reason).toBe("Another program already uses port 3773.");
    expect(windows.action).toEqual({
      kind: "command",
      label: "Copy command to find it",
      command: "netstat -ano | findstr :3773",
    });
    const mac = describeUserError(error, { platform: "mac" });
    expect(mac.action).toEqual({
      kind: "command",
      label: "Copy command to find it",
      command: "lsof -i :3773",
    });
  });

  it("corrupt settings: names the file and opens settings", () => {
    const result = describeUserError({
      _tag: "ServerSettingsError",
      settingsPath: "C:/Users/me/.t3/userdata/settings.json",
      message: "Server settings normalize failed.",
      cause: new SyntaxError("Unexpected token } in JSON at position 12"),
    });
    expect(result.kind).toBe("settings-corrupt");
    expect(result.reason).toBe(
      "The settings file at C:/Users/me/.t3/userdata/settings.json is damaged or has a wrong value.",
    );
    expect(result.action).toEqual({
      kind: "route",
      label: "Open settings",
      to: GENERAL_SETTINGS_ROUTE,
    });
  });

  it("update download failure: offers the installer, or a retry", () => {
    const error = new Error("ERR_UPDATER_ZIP_FILE_NOT_FOUND");
    const result = describeUserError(error);
    expect(result.kind).toBe("update-download-failed");
    expect(result.reason).toBe("Leonidas could not get the update from the update server.");
    expect(result.action).toEqual({
      kind: "url",
      label: "Download installer",
      url: INSTALLER_DOWNLOAD_URL,
    });
    expect(describeUserError("boom", { area: "update", canRetry: true }).action.kind).toBe("retry");
  });

  it("unknown: retries when it can, else offers the details", () => {
    const error = new Error("widget exploded");
    expect(describeUserError(error).kind).toBe("unknown");
    expect(describeUserError(error).reason).toBe("An unexpected error stopped this action.");
    expect(describeUserError(error).action).toEqual({
      kind: "copy-details",
      label: "Copy details",
    });
    expect(describeUserError(error, { canRetry: true }).action.kind).toBe("retry");
  });

  it("keeps the full error in detail, never in the reason", () => {
    const error = new Error("outer", { cause: nodeError("inner failure", "EIO") });
    const result = describeUserError(error);
    expect(result.reason).not.toContain("outer");
    expect(result.detail).toContain("Error: outer");
    expect(result.detail).toContain("Caused by: Error EIO: inner failure");
  });
});

describe("formatErrorDetail", () => {
  it("handles strings and plain values", () => {
    expect(formatErrorDetail("plain text")).toBe("plain text");
    expect(formatErrorDetail(42)).toBe("42");
  });

  it("removes secrets", () => {
    expect(redactSecrets("Authorization: Bearer abc.def")).not.toContain("abc.def");
    expect(redactSecrets("key sk-ant-1234567890abcdef")).toBe("key <REDACTED>");
    expect(formatErrorDetail(new Error("api_key=supersecret failed"))).not.toContain("supersecret");
  });
});

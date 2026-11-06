import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn(async () => true),
  writeTextToClipboard: vi.fn(async () => true),
  recordFeedbackError: vi.fn(),
  toastAdd: vi.fn(),
}));

vi.mock("~/localApi", () => ({
  ensureLocalApi: () => ({ shell: { openExternal: mocks.openExternal } }),
}));
vi.mock("~/hooks/useCopyToClipboard", () => ({
  writeTextToClipboard: mocks.writeTextToClipboard,
}));
vi.mock("~/components/feedback/feedbackContext", () => ({
  recordFeedbackError: mocks.recordFeedbackError,
}));
vi.mock("~/components/ui/toast", () => ({ toastManager: { add: mocks.toastAdd } }));

import { INSTALLER_DOWNLOAD_URL } from "@t3tools/shared/userError";

import { registerUserErrorNavigator, userErrorToastFields } from "./userErrorToast";

const navigate = vi.fn();

function nodeError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  registerUserErrorNavigator(navigate);
});

describe("userErrorToastFields", () => {
  it("provider CLI missing: opens provider settings", () => {
    const fields = userErrorToastFields(nodeError("spawn codex ENOENT", "ENOENT"));
    expect(fields.description).toBe(
      "Leonidas could not find the AI program on this computer. Install it from the AI accounts page.",
    );
    expect(fields.actionProps.children).toBe("Install it");
    fields.actionProps.onClick();
    expect(navigate).toHaveBeenCalledWith("/settings/providers");
  });

  it("auth expired: opens sign-in", () => {
    const fields = userErrorToastFields(new Error("Not logged in. Please run /login."));
    expect(fields.description).toBe(
      "The sign-in expired or was removed. Sign in again to keep chatting.",
    );
    expect(fields.actionProps.children).toBe("Sign in again");
    fields.actionProps.onClick();
    expect(navigate).toHaveBeenCalledWith("/settings/providers");
  });

  it("quota hit: opens usage", () => {
    const fields = userErrorToastFields(new Error("You have hit your usage limit."));
    expect(fields.description).toBe(
      "It used all of its allowance for now. Wait and try again later, or pick another AI in the model menu.",
    );
    expect(fields.actionProps.children).toBe("View usage");
  });

  it("network drop: runs the caller's retry", () => {
    const onRetry = vi.fn();
    const fields = userErrorToastFields(new TypeError("Failed to fetch"), { onRetry });
    expect(fields.description).toBe(
      "Leonidas lost its network connection to the server or provider.",
    );
    expect(fields.actionProps.children).toBe("Try again");
    fields.actionProps.onClick();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("port in use: copies the command that finds the owner", () => {
    const fields = userErrorToastFields(
      nodeError("listen EADDRINUSE: address already in use :::3773", "EADDRINUSE"),
    );
    expect(fields.description).toBe("Another program already uses port 3773.");
    expect(fields.actionProps.children).toBe("Copy command to find it");
    fields.actionProps.onClick();
    expect(mocks.writeTextToClipboard).toHaveBeenCalledWith(
      expect.stringContaining(":3773"),
      "Command",
    );
  });

  it("corrupt settings: opens settings", () => {
    const fields = userErrorToastFields({
      _tag: "ServerSettingsError",
      settingsPath: "settings.json",
      message: "Server settings normalize failed at settings.json.",
    });
    expect(fields.description).toBe(
      "The settings file at settings.json is damaged or has a wrong value.",
    );
    expect(fields.actionProps.children).toBe("Open settings");
    fields.actionProps.onClick();
    expect(navigate).toHaveBeenCalledWith("/settings/general");
  });

  it("update failure: opens the installer download", () => {
    const fields = userErrorToastFields("net::ERR_CONNECTION_RESET", { area: "update" });
    expect(fields.description).toBe("Leonidas could not get the update from the update server.");
    expect(fields.actionProps.children).toBe("Download installer");
    fields.actionProps.onClick();
    expect(mocks.openExternal).toHaveBeenCalledWith(INSTALLER_DOWNLOAD_URL);
  });

  it("unknown: copies the full detail and hides the duplicate copy button", () => {
    const fields = userErrorToastFields(new Error("widget exploded"));
    expect(fields.description).toBe("An unexpected error stopped this action.");
    expect(fields.actionProps.children).toBe("Copy details");
    expect(fields.data.hideCopyButton).toBe(true);
    fields.actionProps.onClick();
    expect(mocks.writeTextToClipboard).toHaveBeenCalledWith(
      expect.stringContaining("widget exploded"),
      "Error details",
    );
  });

  it("logs the full error and keeps it out of the description", () => {
    const error = new Error("raw stack text");
    const fields = userErrorToastFields(error);
    expect(fields.description).not.toContain("raw stack text");
    expect(fields.data.copyText).toContain("raw stack text");
    expect(console.error).toHaveBeenCalledWith("[user-error:unknown]", error);
    expect(mocks.recordFeedbackError).toHaveBeenCalledWith(
      expect.stringContaining("raw stack text"),
    );
  });
});

import { ProviderDriverKind, ProviderInstanceId, type ProviderAuthState } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  CLAUDE_INSTALLING_MESSAGE,
  CLAUDE_WAITING_MESSAGE,
  describeClaudeInstalling,
  getClaudeInstallView,
  getClaudeSignInView,
} from "./claudeSignIn.logic";

describe("CLAUDE_WAITING_MESSAGE", () => {
  it("tells the user to click Authorize and that the app comes back", () => {
    expect(CLAUDE_WAITING_MESSAGE).toMatch(/Authorize/);
    expect(CLAUDE_WAITING_MESSAGE).toMatch(/comes back/);
  });
});

const state = (patch: Partial<ProviderAuthState>): ProviderAuthState => ({
  instanceId: ProviderInstanceId.make("claudeAgent"),
  phase: "idle",
  flowId: null,
  authorizationUrl: null,
  expiresAt: null,
  message: null,
  ...patch,
});

describe("getClaudeSignInView", () => {
  it("is idle with no auth state", () => {
    expect(getClaudeSignInView({ auth: undefined, requested: false })).toEqual({ kind: "idle" });
    expect(getClaudeSignInView({ auth: state({}), requested: false })).toEqual({ kind: "idle" });
  });

  it("waits with no link until this client asked and the first state arrives", () => {
    expect(getClaudeSignInView({ auth: state({}), requested: true })).toEqual({
      kind: "waiting",
      url: null,
      canCancel: false,
    });
  });

  it("shows the sign-in page link and cancel while the browser step runs", () => {
    const auth = state({
      phase: "waiting",
      flowId: "flow-1",
      authorizationUrl: "https://claude.ai/oauth/authorize?state=abc",
    });
    expect(getClaudeSignInView({ auth, requested: true })).toEqual({
      kind: "waiting",
      url: "https://claude.ai/oauth/authorize?state=abc",
      canCancel: true,
    });
  });

  it("prefers the browser interaction link", () => {
    const auth = state({
      phase: "waiting",
      flowId: "flow-1",
      interaction: {
        type: "browser",
        id: "flow-1",
        url: "https://claude.ai/login",
        requiresConsent: false,
      },
    });
    expect(getClaudeSignInView({ auth, requested: true })).toMatchObject({
      url: "https://claude.ai/login",
    });
  });

  it("does not let another client cancel a sign-in it did not start", () => {
    const auth = state({ phase: "waiting", message: "Sign-in is in progress in another client." });
    expect(getClaudeSignInView({ auth, requested: false })).toEqual({
      kind: "waiting",
      url: null,
      canCancel: false,
    });
  });

  it("shows finishing while Claude checks the sign-in and after it succeeded", () => {
    expect(getClaudeSignInView({ auth: state({ phase: "verifying" }), requested: false })).toEqual({
      kind: "finishing",
    });
    expect(getClaudeSignInView({ auth: state({ phase: "succeeded" }), requested: true })).toEqual({
      kind: "finishing",
    });
  });

  it("ignores an old finished attempt on a new visit", () => {
    expect(getClaudeSignInView({ auth: state({ phase: "succeeded" }), requested: false })).toEqual({
      kind: "idle",
    });
    expect(getClaudeSignInView({ auth: state({ phase: "failed" }), requested: false })).toEqual({
      kind: "idle",
    });
  });

  it("shows the failure message, with a plain fallback", () => {
    expect(
      getClaudeSignInView({
        auth: state({ phase: "failed", message: "Claude sign-in expired. Start sign-in again." }),
        requested: true,
      }),
    ).toEqual({ kind: "failed", message: "Claude sign-in expired. Start sign-in again." });
    expect(getClaudeSignInView({ auth: state({ phase: "failed" }), requested: true })).toEqual({
      kind: "failed",
      message: "Claude sign-in did not finish. Try again.",
    });
  });

  it("returns to idle after cancel", () => {
    expect(getClaudeSignInView({ auth: state({ phase: "cancelled" }), requested: true })).toEqual({
      kind: "idle",
    });
  });
});

describe("getClaudeInstallView", () => {
  const base = {
    driver: ProviderDriverKind.make("claudeAgent"),
    operationId: "op-1",
    downloadedBytes: 0,
    totalBytes: null,
    version: null,
    installedVersion: null,
    canRemove: false,
    message: null,
  } as const;

  it("shows progress while the installer runs", () => {
    expect(
      getClaudeInstallView({ installation: { ...base, phase: "downloading" }, requested: false }),
    ).toEqual({ kind: "installing", operationId: "op-1" });
  });

  it("reports success", () => {
    expect(
      getClaudeInstallView({ installation: { ...base, phase: "succeeded" }, requested: false }),
    ).toEqual({ kind: "installed" });
  });

  it("hides an old failure until this client asks again", () => {
    const failed = { ...base, phase: "failed" as const, message: "No internet." };
    expect(getClaudeInstallView({ installation: failed, requested: false })).toEqual({
      kind: "idle",
    });
    expect(getClaudeInstallView({ installation: failed, requested: true })).toEqual({
      kind: "failed",
      message: "No internet.",
    });
  });
});

describe("describeClaudeInstalling", () => {
  it("adds a running clock after the first second", () => {
    expect(describeClaudeInstalling(0)).toBe(CLAUDE_INSTALLING_MESSAGE);
    expect(describeClaudeInstalling(45)).toBe(`${CLAUDE_INSTALLING_MESSAGE} Time so far: 45 s.`);
    expect(describeClaudeInstalling(125.4)).toBe(
      `${CLAUDE_INSTALLING_MESSAGE} Time so far: 2 min 5 s.`,
    );
  });
});

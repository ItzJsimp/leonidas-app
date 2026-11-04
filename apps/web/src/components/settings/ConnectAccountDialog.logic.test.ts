import { describe, expect, it } from "vite-plus/test";

import { sharesLoginWithOtherAccount } from "./ConnectAccountDialog.logic";

describe("sharesLoginWithOtherAccount", () => {
  const first = { instanceId: "claudeAgent", email: "a@x.com" };

  it("is true when another account has the same email", () => {
    const next = { instanceId: "claudeAgent_2", email: "A@x.com " };
    expect(sharesLoginWithOtherAccount(next, [first, next])).toBe(true);
  });

  it("is false for a different email", () => {
    const next = { instanceId: "claudeAgent_2", email: "b@x.com" };
    expect(sharesLoginWithOtherAccount(next, [first, next])).toBe(false);
  });

  it("is false when the email is not known yet", () => {
    const next = { instanceId: "claudeAgent_2" };
    expect(sharesLoginWithOtherAccount(next, [first, next])).toBe(false);
  });

  it("ignores the account itself", () => {
    expect(sharesLoginWithOtherAccount(first, [first])).toBe(false);
  });
});

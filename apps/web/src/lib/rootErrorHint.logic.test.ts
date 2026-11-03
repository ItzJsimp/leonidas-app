import { describe, expect, it } from "vite-plus/test";

import { resolveRootErrorHint } from "./rootErrorHint.logic";

describe("resolveRootErrorHint", () => {
  it("explains a 502 from the primary environment and asks for auto retry", () => {
    const hint = resolveRootErrorHint({ _tag: "PrimaryEnvironmentRequestError", status: 502 });
    expect(hint?.title).toContain("cannot reach its server");
    expect(hint?.autoRetry).toBe(true);
  });

  it("covers 503 and 504", () => {
    for (const status of [503, 504]) {
      expect(
        resolveRootErrorHint({ _tag: "PrimaryEnvironmentRequestError", status }),
      ).not.toBeNull();
    }
  });

  it("names the device, not the server, when the device is offline", () => {
    const hint = resolveRootErrorHint(new Error("Failed to fetch"), false);
    expect(hint?.title).toBe("This device is offline.");
    expect(hint?.autoRetry).toBe(true);
  });

  it("leaves other errors on the generic screen", () => {
    expect(
      resolveRootErrorHint({ _tag: "PrimaryEnvironmentRequestError", status: 401 }),
    ).toBeNull();
    expect(resolveRootErrorHint({ _tag: "Other", status: 502 })).toBeNull();
    expect(resolveRootErrorHint(new Error("boom"))).toBeNull();
    expect(resolveRootErrorHint(null)).toBeNull();
  });
});

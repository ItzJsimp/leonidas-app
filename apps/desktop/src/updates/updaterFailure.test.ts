import { describe, expect, it } from "vite-plus/test";
import { describeUpdaterFailure, isMacSignatureFailure } from "./updaterFailure.ts";

const feed = { owner: "ItzJsimp", repo: "leonidas-code" };
const base = { fallback: "Desktop updater background operation reported an error.", feed };

describe("describeUpdaterFailure", () => {
  it("tells a Mac user to install the newest installer once when the signature is rejected", () => {
    const message = describeUpdaterFailure({
      ...base,
      platform: "darwin",
      cause: new Error("Could not get code signature for running application"),
    });
    expect(message).toContain("Download the newest installer once");
    expect(message).toContain(
      "https://github.com/ItzJsimp/leonidas-code/releases/latest/download/Leonidas-Setup-mac.dmg",
    );
  });

  it("keeps the generic message for other Mac failures and for other systems", () => {
    expect(
      describeUpdaterFailure({ ...base, platform: "darwin", cause: new Error("ENOTFOUND") }),
    ).toBe(base.fallback);
    expect(
      describeUpdaterFailure({ ...base, platform: "win32", cause: "code signature invalid" }),
    ).toBe(base.fallback);
  });

  it("still gives the instruction when the feed is unknown", () => {
    expect(
      describeUpdaterFailure({
        ...base,
        feed: null,
        platform: "darwin",
        cause: "code signature invalid",
      }),
    ).toMatch(/replace the app in Applications\.$/);
  });
});

describe("isMacSignatureFailure", () => {
  it("matches only signature failures on macOS, from errors and plain text", () => {
    expect(isMacSignatureFailure("darwin", new Error("code signature invalid"))).toBe(true);
    expect(isMacSignatureFailure("darwin", "Could not get code signature")).toBe(true);
    expect(isMacSignatureFailure("darwin", new Error("ENOTFOUND github.com"))).toBe(false);
    expect(isMacSignatureFailure("linux", new Error("code signature invalid"))).toBe(false);
  });
});

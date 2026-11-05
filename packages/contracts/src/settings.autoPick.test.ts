import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { ClientSettingsSchema, ClientSettingsPatch } from "./settings.ts";

const decodeClientSettings = Schema.decodeUnknownSync(ClientSettingsSchema);
const decodeClientSettingsPatch = Schema.decodeUnknownSync(ClientSettingsPatch);

describe("ClientSettings skill cap", () => {
  it("defaults to three skills", () => {
    expect(decodeClientSettings({}).composerSuggestSkillCap).toBe(3);
  });

  it.each([0, 6])("rejects an out-of-range cap %s", (composerSuggestSkillCap) => {
    expect(() => decodeClientSettings({ composerSuggestSkillCap })).toThrow();
    expect(() => decodeClientSettingsPatch({ composerSuggestSkillCap })).toThrow();
  });
});

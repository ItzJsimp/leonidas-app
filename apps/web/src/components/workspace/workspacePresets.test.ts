import { describe, expect, it } from "vite-plus/test";

import { newWorkspaceFolder, uniqueWorkspaceId } from "./aiosWorkspace.logic";
import { WORKSPACE_PRESETS } from "./workspacePresets";

describe("WORKSPACE_PRESETS", () => {
  it("offers Personal, Business and Trading, each with an icon, a name and one line", () => {
    expect(WORKSPACE_PRESETS.map((preset) => preset.type)).toEqual([
      "personal",
      "business",
      "trading",
    ]);
    for (const preset of WORKSPACE_PRESETS) {
      expect(preset.icon).toBeTruthy();
      expect(preset.name).not.toBe("");
      expect(preset.line).not.toMatch(/\n/);
    }
  });

  it("prefills Trading so it needs only Create, then opens the Dashboard", () => {
    const trading = WORKSPACE_PRESETS.find((preset) => preset.type === "trading")!;
    const id = uniqueWorkspaceId(trading.defaultName, ["personal"]);
    expect(newWorkspaceFolder("/home/j/.t3/projects", trading.folderParent, id)).toBe(
      "/home/j/.t3/workspaces/trading",
    );
    expect(trading.landing).toBe("/trading/dashboard");
  });

  it("keeps the business folder where the business template expects it", () => {
    const business = WORKSPACE_PRESETS.find((preset) => preset.type === "business")!;
    expect(business.folderParent).toBe("businesses");
    expect(business.defaultName).toBe("");
  });
});

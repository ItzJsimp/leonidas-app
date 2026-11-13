import type { AiosWorkspaceSummary } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  aiosRootForNewProject,
  isAiosRoot,
  projectFillInPrompt,
  projectFolderName,
  projectFolderPreview,
} from "./aiosProject.logic.ts";

const workspace = (root: string, status: AiosWorkspaceSummary["status"] = "ready") =>
  ({ root, status }) as AiosWorkspaceSummary;

describe("aiosRootForNewProject", () => {
  it("prefers the active workspace, then the first listed, then none", () => {
    const first = workspace("C:/aios", "missing");
    const active = workspace("D:/work-aios");
    expect(aiosRootForNewProject([first, active], active)).toBe("D:/work-aios");
    expect(aiosRootForNewProject([first, active], undefined)).toBe("C:/aios");
    expect(aiosRootForNewProject([], undefined)).toBeNull();
  });
});

describe("isAiosRoot", () => {
  const list = [workspace("D:\\My AIOS\\")];

  it("matches the AIOS folder across slash style, case and a trailing slash", () => {
    expect(isAiosRoot(list, "d:/my aios")).toBe(true);
  });

  it("does not match a project folder inside the AIOS", () => {
    expect(isAiosRoot(list, "D:/My AIOS/projects/game")).toBe(false);
  });
});

describe("projectFillInPrompt", () => {
  it("names the project and tells the agent to interview, not invent", () => {
    const prompt = projectFillInPrompt("Space Game");
    expect(prompt).toContain('"Space Game"');
    expect(prompt).toContain("five at most");
    expect(prompt).toContain("Never invent a fact");
  });
});

describe("projectFolderPreview", () => {
  it("shows the folder under the AIOS projects folder, in the AIOS slash style", () => {
    expect(projectFolderPreview(String.raw`C:\Users\Alex\My AIOS\ `.trim(), "Space Game")).toBe(
      String.raw`C:\Users\Alex\My AIOS\projects\space-game`,
    );
    expect(projectFolderPreview("/home/alex/aios", "Space Game")).toBe(
      "/home/alex/aios/projects/space-game",
    );
  });

  it("shows the projects folder while the name is empty", () => {
    expect(projectFolderPreview("/home/alex/aios", "  ")).toBe("/home/alex/aios/projects");
  });

  it("names a symbol-only title project and cuts a long one", () => {
    expect(projectFolderName("!!!")).toBe("project");
    expect(projectFolderName("a".repeat(80))).toHaveLength(60);
  });
});

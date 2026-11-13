import type { AiosWorkspaceSummary, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { groupPickerEntriesByWorkspace } from "./projectPickerGroups";

const local = "env-local" as EnvironmentId;
const remote = "env-remote" as EnvironmentId;
const pid = (id: string) => id as ProjectId;
const entry = (id: string, environmentId: EnvironmentId = local) => ({
  targetProject: { id: pid(id), environmentId },
});

const workspace = (patch: Partial<AiosWorkspaceSummary>): AiosWorkspaceSummary => ({
  root: "D:/x",
  status: "ready",
  id: "x",
  name: "X",
  type: "personal",
  error: null,
  isDefault: false,
  projectIds: [],
  ...patch,
});
const leonidas = workspace({
  root: "D:/Leonidas AIOS",
  id: "leonidas",
  name: "Leonidas AIOS",
  isDefault: true,
  projectIds: [pid("code"), pid("trading")],
});
const gersi = workspace({
  root: "D:/SimplyGersi AIOS",
  id: "gersi",
  name: "SimplyGersi AIOS",
  type: "business",
  projectIds: [pid("gersi-home")],
});

describe("groupPickerEntriesByWorkspace", () => {
  const entries = [entry("code"), entry("gersi-home"), entry("trading")];

  it("lists every workspace, the active project's workspace first, each under its name", () => {
    const groups = groupPickerEntriesByWorkspace(entries, {
      workspaces: [leonidas, gersi],
      environmentId: local,
      activeProjectId: pid("code"),
    });
    expect(groups.map((group) => group.label)).toEqual(["Leonidas AIOS", "SimplyGersi AIOS"]);
    expect(groups[0]?.entries.map((e) => e.targetProject.id)).toEqual([
      pid("code"),
      pid("trading"),
    ]);
    expect(groups[1]?.entries.map((e) => e.targetProject.id)).toEqual([pid("gersi-home")]);
  });

  it("puts the other workspace first when its project is the active one", () => {
    const groups = groupPickerEntriesByWorkspace(entries, {
      workspaces: [leonidas, gersi],
      environmentId: local,
      activeProjectId: pid("gersi-home"),
    });
    expect(groups.map((group) => group.label)).toEqual(["SimplyGersi AIOS", "Leonidas AIOS"]);
  });

  it("shows no heading when one workspace holds every project", () => {
    const groups = groupPickerEntriesByWorkspace([entry("code"), entry("trading")], {
      workspaces: [leonidas, gersi],
      environmentId: local,
      activeProjectId: pid("code"),
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("");
  });

  it("shows no heading without workspaces", () => {
    const groups = groupPickerEntriesByWorkspace(entries, {
      workspaces: [],
      environmentId: null,
      activeProjectId: undefined,
    });
    expect(groups).toEqual([{ key: "projects", label: "", entries }]);
  });

  it("keeps a project of another computer with the active group", () => {
    const groups = groupPickerEntriesByWorkspace([...entries, entry("far", remote)], {
      workspaces: [leonidas, gersi],
      environmentId: local,
      activeProjectId: pid("code"),
    });
    expect(groups[0]?.entries.map((e) => e.targetProject.id)).toContain(pid("far"));
  });
});

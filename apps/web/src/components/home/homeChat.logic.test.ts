import { ProjectId, ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { agentThreadId, findAiosProject, homeModelSelection, homeThreadId } from "./homeChat.logic";

describe("findAiosProject", () => {
  const project = (workspaceRoot: string, deletedAt: string | null = null) => ({
    workspaceRoot,
    deletedAt,
  });

  it("matches the AIOS folder across slash style, case and a trailing slash", () => {
    const aios = project(["D:", "Example AIOS"].join(String.fromCharCode(92)));
    expect(findAiosProject([project("D:/Other"), aios], "d:/example aios/")).toBe(aios);
  });

  it("skips a deleted project and returns null when none matches", () => {
    expect(
      findAiosProject([project("D:/Example AIOS", "2026-11-01T00:00:00Z")], "D:/Example AIOS"),
    ).toBeNull();
    expect(findAiosProject([project("D:/Other")], "D:/Example AIOS")).toBeNull();
  });
});

describe("homeThreadId", () => {
  it("is the same id every time for one project", () => {
    const id = ProjectId.make("project:aios");
    expect(homeThreadId(id)).toBe(homeThreadId(id));
    expect(homeThreadId(id)).not.toBe(homeThreadId(ProjectId.make("project:other")));
  });
});

describe("agentThreadId", () => {
  const project = ProjectId.make("project:aios");

  it("is the same id every time for one agent, so a second click opens the same chat", () => {
    expect(agentThreadId(project, "Reviewer")).toBe(agentThreadId(project, "Reviewer"));
  });

  it("differs by agent, by project, and from the Home chat", () => {
    const reviewer = agentThreadId(project, "Reviewer");
    expect(reviewer).not.toBe(agentThreadId(project, "Scout"));
    expect(reviewer).not.toBe(agentThreadId(ProjectId.make("project:other"), "Reviewer"));
    expect(reviewer).not.toBe(homeThreadId(project));
  });

  it("turns spaces and symbols in a name into dashes", () => {
    expect(agentThreadId(project, "Test Scout!")).toBe(`agent-${project}-test-scout-`);
  });
});

describe("homeModelSelection", () => {
  const instanceId = ProviderInstanceId.make("claudeAgent");
  const codex = ProviderInstanceId.make("codex");
  const last: ModelSelection = { instanceId, model: "claude-opus-5-5" };
  const own: ModelSelection = { instanceId: codex, model: "gpt-6-luna" };
  const providers = [
    { instanceId, enabled: false, installed: true, models: [{ slug: "claude-opus-5-5" }] },
    {
      instanceId: codex,
      enabled: true,
      installed: true,
      models: [{ slug: "gpt-6-sol" }, { slug: "gpt-6-luna", isDefault: true }],
    },
  ];

  it("prefers the last model, then the project's, then the first connected account's default", () => {
    expect(homeModelSelection({ lastUsed: last, projectDefault: own, providers })).toEqual(last);
    expect(homeModelSelection({ lastUsed: null, projectDefault: own, providers })).toEqual(own);
    expect(homeModelSelection({ lastUsed: null, projectDefault: null, providers })).toEqual({
      instanceId: codex,
      model: "gpt-6-luna",
    });
  });

  it("returns null when no account is connected", () => {
    expect(homeModelSelection({ lastUsed: null, projectDefault: null, providers: [] })).toBeNull();
  });
});

import { describe, expect, it } from "vite-plus/test";

import {
  HOME_TEAM_LIST_LIMIT,
  homeAgentBlock,
  homeTeam,
  type HomeTeamEntry,
} from "./homeAgentInstructions.ts";

const agent = (name: string, patch: Partial<HomeTeamEntry> = {}): HomeTeamEntry => ({
  name,
  description: `Does ${name} work.`,
  tier: "free",
  enabled: true,
  legacy: false,
  error: null,
  source: "aios",
  ...patch,
});

describe("homeTeam", () => {
  it("keeps on, valid agents of the AIOS folder, one per name, sorted", () => {
    const team = homeTeam([
      agent("reviewer"),
      agent("explorer"),
      agent("explorer", { description: "A second copy." }),
      agent("off", { enabled: false }),
      agent("old", { legacy: true }),
      agent("broken", { error: "bad file" }),
      agent("project-only", { source: "project" }),
    ]);
    expect(team.map((entry) => entry.name)).toEqual(["explorer", "reviewer"]);
    expect(team[0]?.description).toBe("Does explorer work.");
  });
});

describe("homeAgentBlock", () => {
  it("lists each agent with its job and how it starts", () => {
    const block = homeAgentBlock([agent("explorer"), agent("reviewer", { tier: "confirm" })]);
    expect(block).toContain("Your team (2 agents):");
    expect(block).toContain("- explorer (starts at once): Does explorer work.");
    expect(block).toContain("- reviewer (asks first): Does reviewer work.");
    expect(block).toContain("`leo_delegate_task`");
    expect(block.startsWith("<home_agent>")).toBe(true);
    expect(block.endsWith("</home_agent>")).toBe(true);
  });

  it("says so when the team is empty", () => {
    const block = homeAgentBlock([]);
    expect(block).toContain("The team has no agents yet.");
    expect(block).not.toContain("Your team (");
  });

  it("cuts a long job to one line and a long team to the limit with a count", () => {
    const many = Array.from({ length: HOME_TEAM_LIST_LIMIT + 3 }, (_, index) =>
      agent(`agent-${String(index).padStart(3, "0")}`, {
        description: `Line one.\nLine two. ${"x".repeat(300)}`,
      }),
    );
    const block = homeAgentBlock(many);
    expect(block).toContain(`Your team (${many.length} agents):`);
    expect(block).toContain("- 3 more agents are not listed.");
    expect(block.split("\n").filter((line) => line.startsWith("- agent-")).length).toBe(
      HOME_TEAM_LIST_LIMIT,
    );
    expect(block).not.toMatch(/Line one\.\nLine two/);
    expect(block).toContain("…");
  });
});

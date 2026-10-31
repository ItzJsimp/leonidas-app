import { describe, expect, it } from "vite-plus/test";
import { EFFICIENT_AGENT_RULES } from "./efficientAgentRules.ts";
import {
  activeAiLevel,
  buildRuntimeInstructions,
  QUESTION_BUDGET_REPLY,
  questionBudgetAllows,
  setAiLevelSetting,
  setSharedBrowserAccess,
} from "./runtimeInstructions.ts";
import { MAX_SKILLS_PER_TASK, SKILL_ROUTING_INSTRUCTIONS } from "./skillRouting.ts";

describe("buildRuntimeInstructions", () => {
  it("routes logged-in sites across providers only while shared access is enabled", () => {
    try {
      setSharedBrowserAccess(false);
      expect(buildRuntimeInstructions({ harness: "Codex" })).not.toContain("<shared_browser>");
      setSharedBrowserAccess(true);
      for (const harness of ["Codex", "Claude Code", "ACP"]) {
        const prompt = buildRuntimeInstructions({ harness });
        expect(prompt).toContain('profileId="leonidas-shared-browser"');
        expect(prompt).toContain("Whop course");
        expect(prompt).toContain("development servers and public pages in ordinary Preview");
        expect(prompt).toContain("Ask before any action that buys, posts, or sends");
      }
    } finally {
      setSharedBrowserAccess(false);
    }
  });
  it("requires explicit registration of every PR and stack layer", () => {
    const instructions = buildRuntimeInstructions({ harness: "Codex" });
    expect(instructions).toContain("When the t3-code MCP server exposes link_pull_request");
    expect(instructions).toContain("with the full PR URL immediately after creating a PR");
    expect(instructions).toContain("for every layer of a stack");
    expect(instructions).toContain("call list_thread_pull_requests and link any missing PR");
  });

  it("asks the agent to say what finished when a wait ends", () => {
    const instructions = buildRuntimeInstructions({ harness: "Claude Code" });
    expect(instructions).toContain("<waiting_handoff>");
    expect(instructions).toContain("naming what finished and that you are carrying on");
  });

  it("adds the Ponytail rules unless the plugin already injects them", () => {
    expect(buildRuntimeInstructions({ harness: "Codex" })).toContain("<ponytail>");
    expect(buildRuntimeInstructions({ harness: "Codex", ponytailPlugin: true })).not.toContain(
      "<ponytail>",
    );
  });

  it("keeps known model and effort metadata on one line", () => {
    expect(
      buildRuntimeInstructions({
        harness: "Codex",
        model: "  custom\nmodel  ",
        reasoningEffort: " high\n",
      }),
    ).toContain("through the Codex harness, as custom model with high reasoning effort.");
  });

  it("names the model by display name and slug when they differ", () => {
    expect(
      buildRuntimeInstructions({ harness: "Codex", model: "gpt-5.4", modelName: "GPT-5.4" }),
    ).toContain("through the Codex harness, as GPT-5.4 (model slug: gpt-5.4).");
    expect(
      buildRuntimeInstructions({ harness: "Codex", model: "my-model", modelName: "my-model" }),
    ).toContain("through the Codex harness, as my-model.");
  });

  it.each([undefined, "", "auto", "default"])("omits unresolved model %s", (model) => {
    const instructions = buildRuntimeInstructions({ harness: "Cursor", model });
    expect(instructions).toContain("through the Cursor harness.");
    expect(instructions).not.toContain("reasoning effort");
  });

  it("appends the Leonidas output standard with the Dock and no status ritual", () => {
    const instructions = buildRuntimeInstructions({ harness: "Codex", aiLevel: "builder" });
    expect(instructions).toContain("<leonidas_output_standard>");
    expect(instructions).not.toContain("**Focus:**");
    expect(instructions).toContain("Do not report model, token, cache, mode");
    expect(instructions).toContain("leonidas-canvas");
    expect(instructions).toContain("html_render");
    expect(instructions).not.toContain("over 400 words");
    expect(instructions).toContain("actually read the available leonidas-canvas/SKILL.md");
    expect(instructions).toContain("skillLoaded:true");
    expect(instructions).toContain("### 🎯 TL;DR");
    expect(instructions).toContain("### ⚡ Immediate Next Actions");
    expect(instructions).toContain("### ❓ Input & Decisions Needed");
    expect(instructions).toContain("</leonidas_output_standard>");
  });

  it("requires ASD-STE100 language for every provider", () => {
    for (const harness of ["Codex", "Claude Code", "Cursor"]) {
      expect(buildRuntimeInstructions({ harness })).toContain("ASD-STE100");
    }
  });
});

describe("efficient work rules", () => {
  it("reach every harness and stay under 400 tokens", () => {
    for (const harness of ["Codex", "Claude Code", "Cursor"]) {
      expect(buildRuntimeInstructions({ harness })).toContain("<efficient_work>");
    }
    expect(Math.ceil(EFFICIENT_AGENT_RULES.length / 4)).toBeLessThanOrEqual(400);
  });
});

describe("skill routing", () => {
  it("reaches every harness, caps skills per task and stays under 200 tokens", () => {
    for (const harness of ["Codex", "Claude Code", "Cursor"]) {
      const instructions = buildRuntimeInstructions({ harness });
      expect(instructions).toContain("<skill_routing>");
      expect(instructions).toContain(`at most ${MAX_SKILLS_PER_TASK} skills`);
      expect(instructions).toContain("Using <skill>: <reason");
    }
    expect(Math.ceil(SKILL_ROUTING_INSTRUCTIONS.length / 4)).toBeLessThanOrEqual(200);
  });
});

describe("user question instructions", () => {
  it("teaches the grill-style structured question flow to every harness", () => {
    const instructions = buildRuntimeInstructions({ harness: "Codex", aiLevel: "builder" });
    expect(instructions).toContain("<asking_the_user>");
    expect(instructions).toContain('end its label with " (Recommended)"');
    expect(instructions).toContain("whole frontier in one call");
  });
});

describe("AI level", () => {
  const forLevel = (aiLevel: "new" | "beginner" | "comfortable" | "builder") =>
    buildRuntimeInstructions({ harness: "Claude Code", aiLevel });

  it("gives new and beginner users act-first rules, a slim Dock and tips", () => {
    for (const level of ["new", "beginner"] as const) {
      const text = forLevel(level);
      expect(text).toContain("Act first and report after.");
      expect(text).toContain("### 🎯 TL;DR");
      expect(text).toContain("🔁 Assumed:");
      expect(text).not.toContain("### ⚡ Immediate Next Actions");
      expect(text).not.toContain("whole frontier in one call");
      expect(text).toContain("💡");
      expect(text).not.toContain("Also ask before a guess");
    }
  });

  it("lets comfortable users get a question before a costly guess, without tips", () => {
    const text = forLevel("comfortable");
    expect(text).toContain("Also ask before a guess");
    expect(text).not.toContain("💡");
  });

  it("keeps the full Dock and the grill-style questions for builders", () => {
    const text = forLevel("builder");
    expect(text).toContain("### ⚡ Immediate Next Actions");
    expect(text).toContain("whole frontier in one call");
    expect(text).not.toContain("Act first and report after.");
  });

  it("uses the install's level when none is passed, after the day-30 step up", () => {
    setAiLevelSetting("builder", "");
    expect(buildRuntimeInstructions({ harness: "Codex" })).toContain("whole frontier in one call");
    setAiLevelSetting("new", "2026-01-01");
    expect(activeAiLevel("2026-03-01")).toBe("beginner");
    setAiLevelSetting("new", "");
    expect(buildRuntimeInstructions({ harness: "Codex" })).toContain("Act first and report after.");
  });

  it("keeps the new-user prompt no larger than the builder prompt", () => {
    expect(forLevel("new").length).toBeLessThanOrEqual(forLevel("builder").length);
  });
});

describe("question budget", () => {
  it("allows one question per turn for new and beginner users only", () => {
    expect(questionBudgetAllows("new", 0)).toBe(true);
    expect(questionBudgetAllows("new", 1)).toBe(false);
    expect(questionBudgetAllows("beginner", 1)).toBe(false);
    expect(questionBudgetAllows("comfortable", 5)).toBe(true);
    expect(questionBudgetAllows("builder", 5)).toBe(true);
    expect(QUESTION_BUDGET_REPLY).toContain("Pick your recommended option");
  });
});

import { assert, describe, it } from "@effect/vitest";

import { LEONIDAS_OUTPUT_STANDARD } from "./outputStandard.ts";
import {
  T3_ACP_FALLBACK_INSTRUCTIONS,
  T3_CODE_BROWSER_TOOL_INSTRUCTIONS,
  T3_CODE_ORCHESTRATION_INSTRUCTIONS,
  t3AcpPromptWithInstructions,
  t3OrchestrationPromptForFirstRun,
  t3OrchestrationSystemPrompt,
} from "./orchestrationInstructions.ts";

describe("T3 orchestration provider instructions", () => {
  it("distinguishes delegated subagents from ordinary top-level threads", () => {
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "`delegate_task` for another provider");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "make new top-level threads");
    assert.include(
      T3_CODE_ORCHESTRATION_INSTRUCTIONS,
      '"Subagent", "delegate", and "parallel" never mean one',
    );
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "another provider");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "is a new `delegate_task`");
    assert.include(
      T3_CODE_ORCHESTRATION_INSTRUCTIONS,
      "Never continue a review with `t3_thread_send` on `childThreadId`",
    );
  });

  it("guides model discovery, bounded delegation, and review", () => {
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "Tiered orchestration");
    assert.include(
      T3_CODE_ORCHESTRATION_INSTRUCTIONS,
      "Keep planning, architecture, integration, and final review",
    );
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "from `orchestrator_capabilities`");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "Track every delegated task by `taskId`");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "Report checks that could not run");
  });

  it("keeps parallel decision exploration read-only and closes the frontend verification loop", () => {
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "two independent, read-only");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "Children share the workspace");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "separate worktrees");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "preview_status");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "inspect it again");
  });

  it("tells the lead agent to delegate simple work to cheaper or faster models", () => {
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "You lead the AI accounts");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "cheaper or faster model");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "Inspect its diff");
  });

  it("documents structured schedules instead of JSON strings", () => {
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "is an object, never JSON text");
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, '"everyMs":3600000');
    assert.include(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "bindToCurrentThread=false");
  });

  it("injects prompt fallback only for an MCP-enabled first run", () => {
    const prompt = "Inspect the repository.";
    const injected = t3OrchestrationPromptForFirstRun({
      prompt,
      runOrdinal: 1,
      hasT3Mcp: true,
    });

    assert.include(injected, "<t3_code_orchestration_instructions>");
    assert.include(injected, `<user_request>\n${prompt}\n</user_request>`);
    assert.equal(
      t3OrchestrationPromptForFirstRun({ prompt, runOrdinal: 2, hasT3Mcp: true }),
      prompt,
    );
    assert.equal(
      t3OrchestrationPromptForFirstRun({ prompt, runOrdinal: 1, hasT3Mcp: false }),
      prompt,
    );
  });

  it("only exposes the system prompt when the T3 MCP server is attached", () => {
    assert.equal(t3OrchestrationSystemPrompt(false), undefined);
    assert.equal(t3OrchestrationSystemPrompt(true), T3_CODE_ORCHESTRATION_INSTRUCTIONS);
  });

  it("gives ACP sessions provider-neutral mode, browser, and orchestration guidance", () => {
    const injected = t3AcpPromptWithInstructions({
      prompt: "Inspect the repository.",
      state: { interactionMode: "default", hasT3Mcp: true },
    });

    assert.include(injected, "Leonidas interaction mode: Default");
    assert.include(injected, "Leonidas browser");
    assert.include(injected, "Leonidas orchestration");
    assert.include(injected, "<user_request>\nInspect the repository.\n</user_request>");
  });

  it("keeps the terminal ACP fallback out of non-ACP orchestration prompts", () => {
    assert.notInclude(T3_CODE_ORCHESTRATION_INSTRUCTIONS, "T3_ACP_MCP_NODE");
    assert.notInclude(
      t3OrchestrationPromptForFirstRun({ prompt: "x", runOrdinal: 1, hasT3Mcp: true }),
      "T3_ACP_MCP_NODE",
    );
    assert.notInclude(t3OrchestrationSystemPrompt(true) ?? "", "T3_ACP_MCP_NODE");
  });

  it("adds the terminal ACP fallback only to MCP-enabled ACP prompts", () => {
    const withMcp = t3AcpPromptWithInstructions({
      prompt: "x",
      state: { interactionMode: "default", hasT3Mcp: true },
    });
    const withoutMcp = t3AcpPromptWithInstructions({
      prompt: "x",
      state: { interactionMode: "default", hasT3Mcp: false },
    });

    assert.include(withMcp, "ACP fallback:");
    assert.include(withMcp, "acp-mcp-call delegate_task");
    assert.notInclude(withoutMcp, "T3_ACP_MCP_NODE");
  });

  it("injects the browser block only when browser tools are live", () => {
    const build = (hasBrowserTools: boolean) =>
      t3AcpPromptWithInstructions({
        prompt: "x",
        state: { interactionMode: "default", hasT3Mcp: true, hasBrowserTools },
      });
    assert.include(build(true), "Leonidas browser");
    assert.notInclude(build(false), "Leonidas browser");
    assert.include(build(false), "Leonidas orchestration");
  });

  it("injects the ACP fallback block only when the node bridge is available", () => {
    const build = (hasAcpFallback: boolean) =>
      t3AcpPromptWithInstructions({
        prompt: "x",
        state: { interactionMode: "default", hasT3Mcp: true, hasAcpFallback },
      });
    assert.include(build(true), "ACP fallback:");
    assert.notInclude(build(false), "ACP fallback:");
    assert.include(build(false), "Leonidas orchestration");
  });

  it("reinjects when only browser or fallback availability changes", () => {
    const previousState = { interactionMode: "default", hasT3Mcp: true } as const;
    assert.include(
      t3AcpPromptWithInstructions({
        prompt: "x",
        state: { ...previousState, hasBrowserTools: false },
        previousState,
      }),
      "<t3_code_instructions>",
    );
  });

  it("reinjects ACP guidance only when mode or tool availability changes", () => {
    const prompt = "Continue.";
    const defaultState = { interactionMode: "default", hasT3Mcp: true } as const;

    assert.equal(
      t3AcpPromptWithInstructions({ prompt, state: defaultState, previousState: defaultState }),
      prompt,
    );
    assert.include(
      t3AcpPromptWithInstructions({
        prompt,
        state: { ...defaultState, interactionMode: "plan" },
        previousState: defaultState,
      }),
      "Leonidas interaction mode: Plan",
    );
    const withoutMcp = t3AcpPromptWithInstructions({
      prompt,
      state: { interactionMode: "default", hasT3Mcp: false },
    });
    assert.include(withoutMcp, "Leonidas interaction mode: Default");
    assert.notInclude(withoutMcp, "Leonidas browser");
    assert.notInclude(withoutMcp, "Leonidas orchestration");
  });
});

describe("injected instruction budget", () => {
  const blocks = [
    T3_CODE_ORCHESTRATION_INSTRUCTIONS,
    T3_CODE_BROWSER_TOOL_INSTRUCTIONS,
    T3_ACP_FALLBACK_INSTRUCTIONS,
    LEONIDAS_OUTPUT_STANDARD,
  ];

  it("never repeats a heading", () => {
    const headings = blocks.flatMap((block) => block.match(/^#{2,4} .+$/gm) ?? []);
    assert.deepStrictEqual(
      headings.filter((heading, index) => headings.indexOf(heading) !== index),
      [],
    );
  });

  it("names every answer block type the chat can render", () => {
    for (const type of ["choices", "checklist", "table", "chart"]) {
      assert.include(LEONIDAS_OUTPUT_STANDARD, `leo:${type}`);
    }
  });

  // Ratchet: every turn pays for this text. Lower the cap when you trim; raise it only on purpose.
  it("stays inside the character budget", () => {
    const total = blocks.reduce((sum, block) => sum + block.length, 0);
    assert.isAtMost(total, 14_903);
  });

  it("keeps a thread without browser or ACP fallback below the full budget", () => {
    const plain = t3AcpPromptWithInstructions({
      prompt: "",
      state: {
        interactionMode: "default",
        hasT3Mcp: true,
        hasBrowserTools: false,
        hasAcpFallback: false,
      },
    });
    const full = t3AcpPromptWithInstructions({
      prompt: "",
      state: { interactionMode: "default", hasT3Mcp: true },
    });
    assert.isAtMost(
      plain.length + LEONIDAS_OUTPUT_STANDARD.length,
      14_903 - T3_CODE_BROWSER_TOOL_INSTRUCTIONS.length - T3_ACP_FALLBACK_INSTRUCTIONS.length + 600,
    );
    assert.isAbove(
      full.length - plain.length,
      T3_CODE_BROWSER_TOOL_INSTRUCTIONS.length + T3_ACP_FALLBACK_INSTRUCTIONS.length - 10,
    );
  });
});

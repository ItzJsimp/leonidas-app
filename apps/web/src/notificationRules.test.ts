import type { FoldedFeedEvent } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useEventFeedStore } from "./eventFeedStore";
import { isShown, popsUp, ruleFor, ruleGroups, typeLabel } from "./notificationRules";

const event = (overrides: Partial<FoldedFeedEvent>): FoldedFeedEvent =>
  ({
    id: "evt_1",
    ts: "2026-11-08T21:02:00.000Z",
    level: "needs_you",
    type: "agent.needs_input",
    title: "Input needed",
    body: "Thin Leonidas layer for upstream",
    actor: { kind: "app", name: "Leonidas" },
    count: 1,
    ...overrides,
  }) as FoldedFeedEvent;

const rules = () => useEventFeedStore.getState().typeRules;

describe("notification rules", () => {
  beforeEach(() => useEventFeedStore.setState({ typeRules: {} }));

  it("a muted notification type shows no toast", () => {
    const question = event({});
    expect(popsUp(question, rules())).toBe(true);

    useEventFeedStore.getState().setTypeRule("agent.needs_input", "inbox");
    expect(popsUp(question, rules())).toBe(false);
    expect(isShown(question, rules())).toBe(true);

    useEventFeedStore.getState().setTypeRule("agent.needs_input", "off");
    expect(popsUp(question, rules())).toBe(false);
    expect(isShown(question, rules())).toBe(false);

    // Other types keep their own rule.
    expect(popsUp(event({ type: "agent.failed", level: "failed" }), rules())).toBe(true);
  });

  it("an agent's task move to review or done pops up by default", () => {
    const agent = { kind: "agent", name: "claudeAgent" } as const;
    expect(popsUp(event({ type: "task.review", actor: agent }), rules())).toBe(true);
    expect(popsUp(event({ type: "task.done", level: "info", actor: agent }), rules())).toBe(true);
    expect(popsUp(event({ type: "task.worked", level: "info", actor: agent }), rules())).toBe(
      false,
    );
    expect(typeLabel("task.review")).toBe("Task ready for review");
  });

  it("a type set to Toast pops up even when its default is Inbox only", () => {
    const worked = event({
      type: "task.worked",
      level: "info",
      actor: { kind: "agent", name: "claudeAgent" },
    });
    expect(ruleFor(worked, rules())).toBe("inbox");
    useEventFeedStore.getState().setTypeRule("task.worked", "toast");
    expect(popsUp(worked, rules())).toBe(true);
  });

  it("keeps the old defaults: failures and questions pop up, script info does not", () => {
    expect(ruleFor(event({ level: "failed", type: "watchdog.failed" }), {})).toBe("toast");
    expect(ruleFor(event({ level: "info", type: "agent.finished" }), {})).toBe("toast");
    expect(
      ruleFor(
        event({ level: "info", type: "agent.finished", actor: { kind: "script", name: "x" } }),
        {},
      ),
    ).toBe("inbox");
  });

  it("groups types by source, busiest first, and lists app types that have not happened", () => {
    const groups = ruleGroups(
      [
        event({
          id: "a",
          type: "watchdog.failed",
          level: "failed",
          count: 3,
          actor: { kind: "script", name: "Send-Notification.ps1" },
        }),
        event({
          id: "b",
          type: "watchdog.info",
          level: "info",
          count: 1,
          actor: { kind: "script", name: "Send-Notification.ps1" },
        }),
        event({ id: "c" }),
      ],
      { "watchdog.info": "off" },
    );
    expect(groups.map((group) => group.source)).toEqual(["Send-Notification.ps1", "Leonidas"]);
    expect(groups[0]!.rows.map((row) => [row.type, row.count, row.rule, row.isDefault])).toEqual([
      ["watchdog.failed", 3, "toast", true],
      ["watchdog.info", 1, "off", false],
    ]);
    const app = groups[1]!.rows.map((row) => row.type);
    expect(app).toContain("agent.needs_permission");
    expect(groups[1]!.rows.find((row) => row.type === "agent.failed")?.lastAt).toBeNull();
  });

  it("names types in plain words", () => {
    expect(typeLabel("agent.needs_input")).toBe("Chat needs your answer");
    expect(typeLabel("model_registry.discovered.info")).toBe("Model registry discovered info");
  });
});

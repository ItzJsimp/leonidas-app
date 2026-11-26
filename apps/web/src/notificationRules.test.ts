import type { FoldedFeedEvent } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useEventFeedStore } from "./eventFeedStore";
import {
  isShown,
  popsUp,
  ruleFor,
  ruleGroups,
  typeDescription,
  typeLabel,
} from "./notificationRules";

const event = (overrides: Partial<FoldedFeedEvent>): FoldedFeedEvent =>
  ({
    id: "evt_1",
    ts: "2026-11-08T21:02:00.000Z",
    level: "needs_you",
    type: "agent.needs_permission",
    title: "Chat needs permission",
    body: "Thin Leonidas layer for upstream",
    actor: { kind: "app", name: "Leonidas" },
    count: 1,
    ...overrides,
  }) as FoldedFeedEvent;

const rules = () => useEventFeedStore.getState().typeRules;

describe("notification rules", () => {
  beforeEach(() => useEventFeedStore.setState({ typeRules: {} }));

  it("a muted notification type shows no toast", () => {
    const permission = event({});
    expect(popsUp(permission, rules())).toBe(true);

    useEventFeedStore.getState().setTypeRule("agent.needs_permission", "inbox");
    expect(popsUp(permission, rules())).toBe(false);
    expect(isShown(permission, rules())).toBe(true);

    useEventFeedStore.getState().setTypeRule("agent.needs_permission", "off");
    expect(popsUp(permission, rules())).toBe(false);
    expect(isShown(permission, rules())).toBe(false);

    // Other types keep their own rule.
    expect(popsUp(event({ type: "agent.failed", level: "failed" }), rules())).toBe(true);
  });

  it("retires agent.needs_input permanently even when a saved rule exists", () => {
    const retired = event({ type: "agent.needs_input", level: "needs_you" });
    useEventFeedStore.getState().setTypeRule("agent.needs_input", "toast");
    expect(ruleFor(retired, rules())).toBe("off");
    expect(popsUp(retired, rules())).toBe(false);
    expect(isShown(retired, rules())).toBe(false);

    const groups = ruleGroups([retired], rules());
    const allTypes = groups.flatMap((group) => group.rows.map((row) => row.type));
    expect(allTypes).not.toContain("agent.needs_input");
  });

  it("keeps task.worked in Inbox only even for failed runs, unless explicitly overridden", () => {
    const failedWorked = event({
      type: "task.worked",
      level: "failed",
      actor: { kind: "agent", name: "claudeAgent" },
    });
    expect(ruleFor(failedWorked, rules())).toBe("inbox");
    expect(popsUp(failedWorked, rules())).toBe(false);
    useEventFeedStore.getState().setTypeRule("task.worked", "toast");
    expect(popsUp(failedWorked, rules())).toBe(true);
  });

  it("keeps the defaults: failures and questions pop up, script info does not", () => {
    expect(ruleFor(event({ level: "failed", type: "watchdog.failed" }), {})).toBe("toast");
    expect(ruleFor(event({ level: "info", type: "agent.finished" }), {})).toBe("toast");
    expect(
      ruleFor(
        event({ level: "info", type: "agent.finished", actor: { kind: "script", name: "x" } }),
        {},
      ),
    ).toBe("inbox");
  });

  it("groups Leonidas chats and Watchers first, then custom scripts by volume", () => {
    const script = { kind: "script" as const, name: "Send-Notification.ps1" };
    const groups = ruleGroups(
      [
        event({ id: "a", type: "watchdog.failed", level: "failed", count: 3, actor: script }),
        event({ id: "b", type: "watchdog.info", level: "info", count: 1, actor: script }),
        event({
          id: "w",
          type: "watcher.repo-health",
          level: "needs_you",
          title: "Repo health: 12 problems",
          count: 5,
          actor: { kind: "script", name: "Repo health" },
        }),
        event({ id: "c" }),
      ],
      { "watchdog.info": "off" },
    );
    expect(groups.map((g) => g.source)).toEqual([
      "Leonidas chats",
      "Watchers",
      "Send-Notification.ps1",
    ]);
    const repoHealth = groups[1]!.rows.find((row) => row.type === "watcher.repo-health");
    expect(groups[1]!.manageTo).toBe("/automations");
    expect([repoHealth?.label, repoHealth?.count]).toEqual(["Repo health", 5]);
    expect(repoHealth?.description).toContain("stale worktrees");
    expect(groups[2]!.rows.map((r) => [r.type, r.count, r.rule, r.isDefault])).toEqual([
      ["watchdog.failed", 3, "toast", true],
      ["watchdog.info", 1, "off", false],
    ]);
    const appTypes = groups[0]!.rows.map((row) => row.type);
    expect(appTypes).toContain("agent.needs_permission");
    expect(appTypes).not.toContain("agent.needs_input");
    expect(groups[0]!.rows.find((row) => row.type === "agent.failed")?.lastAt).toBeNull();
  });

  it("pops up for a finished chat but not for a finished delegated task", () => {
    const finished = { level: "info", title: "Chat finished" } as const;
    expect(popsUp(event({ ...finished, type: "agent.finished" }), rules())).toBe(true);
    expect(popsUp(event({ ...finished, type: "agent.child_finished" }), rules())).toBe(false);
    expect(isShown(event({ ...finished, type: "agent.child_finished" }), rules())).toBe(true);
  });

  it("names and describes types in plain words without raw prefixes", () => {
    expect(typeLabel("watcher.repo-health")).toBe("Repo health");
    expect(typeLabel("watcher.release-health")).toBe("Release health");
    expect(typeLabel("model_registry.discovered.info")).toBe("New AI models found");
    expect(typeDescription("watcher.release-health")).toContain("boot smoke test");
    expect(typeDescription("custom.failed", "MyScript.ps1")).toBe(
      "Error reported by MyScript.ps1.",
    );
  });
});

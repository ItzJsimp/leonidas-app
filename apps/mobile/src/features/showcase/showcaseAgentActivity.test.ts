import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import * as NodeAssert from "node:assert/strict";
import { it } from "vite-plus/test";

import {
  buildShowcaseAgentActivity,
  SHOWCASE_AGENT_ACTIVITY_ROWS,
  showcaseAndroidActivityData,
} from "./showcaseAgentActivity";

const NOW = Date.parse("2026-07-16T09:00:00.000Z");

const project = (environmentId: string, id: string, title: string) =>
  ({
    environmentId: EnvironmentId.make(environmentId),
    id: ProjectId.make(id),
    title,
  }) as EnvironmentProject;

const thread = (environmentId: string, id: string, projectId: string, title: string) =>
  ({
    environmentId: EnvironmentId.make(environmentId),
    id: ThreadId.make(id),
    projectId: ProjectId.make(projectId),
    title,
  }) as EnvironmentThreadShell;

const projects = [
  project("moonbase-terminal", "t3code", "Leonidas"),
  project("suspense-station", "react", "React"),
  project("kernel-cabin", "linux", "Linux"),
];

const threads = [
  thread("moonbase-terminal", "remote-command-center", "t3code", "Make remote coding feel local"),
  thread(
    "moonbase-terminal",
    "pocket-command-center",
    "t3code",
    "Put the command center in your pocket",
  ),
  thread("suspense-station", "buttery-suspense", "react", "Make Suspense transitions buttery"),
  thread("kernel-cabin", "beautiful-boot", "linux", "Make boot logs oddly beautiful"),
];

it("waits until every staged thread and its project have loaded", () => {
  NodeAssert.strictEqual(buildShowcaseAgentActivity(threads.slice(1), projects, NOW), null);
  NodeAssert.strictEqual(buildShowcaseAgentActivity(threads, projects.slice(0, 2), NOW), null);
});

it("stages relay-shaped rows against the seeded threads", () => {
  const activity = buildShowcaseAgentActivity(threads, projects, NOW);
  NodeAssert.notStrictEqual(activity, null);
  if (!activity) return;

  NodeAssert.strictEqual(activity.activeCount, 3);
  NodeAssert.deepStrictEqual(
    activity.activities.map((row) => [row.threadId, row.status, row.projectTitle, row.updatedAt]),
    [
      ["pocket-command-center", "Approval", "Leonidas", "2026-07-16T08:59:00.000Z"],
      ["beautiful-boot", "Input", "Linux", "2026-07-16T08:56:00.000Z"],
      ["buttery-suspense", "Working", "React", "2026-07-16T08:58:00.000Z"],
      ["remote-command-center", "Done", "Leonidas", "2026-07-16T08:57:00.000Z"],
    ],
  );
  NodeAssert.strictEqual(
    activity.activities[0]?.deepLink,
    "/threads/moonbase-terminal/pocket-command-center",
  );
  NodeAssert.strictEqual(activity.activities.length, SHOWCASE_AGENT_ACTIVITY_ROWS.length);
});

it("encodes the Android Live Update and its alert like a relay push", () => {
  const activity = buildShowcaseAgentActivity(threads, projects, NOW);
  NodeAssert.notStrictEqual(activity, null);
  if (!activity) return;
  const data = showcaseAndroidActivityData(activity, NOW);

  NodeAssert.strictEqual(data.active, "true");
  NodeAssert.strictEqual(data.activity_chip, "Review");
  NodeAssert.strictEqual(data.activity_title, "3 active AI chats · 2 need attention");
  NodeAssert.strictEqual(
    data.activity_line_0,
    "Approval\tPut the command center in your pocket\tLeonidas",
  );
  NodeAssert.strictEqual(data.activity_line_3, "Done\tMake remote coding feel local\tLeonidas");
  NodeAssert.strictEqual(data.alert_title, "Put the command center in your pocket");
  NodeAssert.strictEqual(data.alert_body, "Approval: Leonidas");
  NodeAssert.strictEqual(data.alert_path, "/threads/moonbase-terminal/pocket-command-center");
});

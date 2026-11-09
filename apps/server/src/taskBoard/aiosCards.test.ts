// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalConsole:off - plain Node card parsing, no Effect runtime.
import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import {
  applyCardPatch,
  cardToTask,
  createCardFile,
  discoverProjects,
  doneWhenItems,
  findAiosRoot,
  findCardFile,
  parseFrontmatter,
  readAiosCardFile,
  readAiosTasks,
  resolveMember,
  statusFromCard,
  statusToCard,
  type AiosCardCache,
} from "./aiosCards.ts";

const NOW = new Date(2026, 9, 11, 14, 30).getTime();

describe("nested game repo cards", () => {
  const gb = (id: string, status: string, priority = "P1") =>
    `---\nid: ${id}\ntitle: "${id} card"\nowner: mob\nsystem: Pipeline\nstatus: ${status}\npriority: ${priority}\ndepends: []\ndue: 2026-10-20\n---\n\n## Goal\nShip it.\n`;
  it("maps game words to board statuses", () => {
    expect(statusFromCard("doing")).toBe("in_progress");
    expect(statusFromCard("later")).toBe("parked");
    expect(statusFromCard("cut")).toBe("retired");
    expect(statusFromCard("todo")).toBe("todo");
  });
  it("writes status and priority back in game words and finds the nested file", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "task-board-game-wb-"));
    const dir = NodePath.join(root, "projects", "rent-due-games", "clean-the-goo");
    try {
      NodeFS.mkdirSync(NodePath.join(dir, ".git"), { recursive: true });
      NodeFS.mkdirSync(NodePath.join(dir, "tasks"));
      NodeFS.mkdirSync(NodePath.join(root, "tasks"));
      const file = NodePath.join(dir, "tasks", "GB-005-x.md");
      NodeFS.writeFileSync(file, gb("GB-005", "todo", "P2"));
      expect(findCardFile(root, "GB-005-x.md")?.toLowerCase()).toBe(file.toLowerCase());
      const next = applyCardPatch(
        NodeFS.readFileSync(file, "utf8"),
        { actor: "Jake", status: "in_progress", priority: "critical" },
        NOW,
      );
      expect(next).toMatch(/^status: doing$/m);
      expect(next).toMatch(/^priority: P0$/m);
      expect(applyCardPatch(next, { actor: "Jake", status: "retired" }, NOW)).toMatch(
        /^status: cut$/m,
      );
    } finally {
      NodeFS.rmSync(root, { recursive: true, force: true });
    }
  });
  it("reads cards from a child repo that has its own .git, and nothing deeper", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "task-board-game-"));
    const put = (rel: string, text: string) => {
      const file = NodePath.join(root, rel);
      NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
      NodeFS.writeFileSync(file, text);
    };
    try {
      put("projects/rent-due-games/clean-the-goo/.git/HEAD", "ref: refs/heads/main\n");
      put("projects/rent-due-games/clean-the-goo/tasks/GB-001-a.md", gb("GB-001", "doing", "P0"));
      put("projects/rent-due-games/clean-the-goo/tasks/GB-002-b.md", gb("GB-002", "later"));
      put("projects/rent-due-games/clean-the-goo/tasks/GB-003-c.md", gb("GB-003", "cut", "P3"));
      put("projects/rent-due-games/loose/tasks/GB-009-x.md", gb("GB-009", "todo"));
      put("projects/rent-due-games/clean-the-goo/deeper/.git/HEAD", "x\n");
      put("projects/rent-due-games/clean-the-goo/deeper/tasks/GB-010-y.md", gb("GB-010", "todo"));
      const tasks = readAiosTasks(root, { now: NOW });
      expect(tasks.map((task) => task.id).sort()).toEqual(["GB-001", "GB-002", "GB-003"]);
      const byId = new Map(tasks.map((task) => [task.id, task]));
      expect(byId.get("GB-001")).toMatchObject({
        projectSlug: "rent-due-games",
        status: "in_progress",
        priority: "critical",
      });
      expect(byId.get("GB-002")?.status).toBe("parked");
      expect(byId.get("GB-003")).toMatchObject({ status: "retired", priority: "low" });
    } finally {
      NodeFS.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("editable due dates", () => {
  it.each(["\n", "\r\n"])("sets and clears dates without damaging the card (%j)", (eol) => {
    const raw = card('id: task-date\nname: "Café"\ncustom: keep', "# Café\n\nDetails.\n", eol);
    const dated = applyCardPatch(raw, { actor: "Jake", due: "2026-10-12" }, NOW);
    expect(cardToTask({ fileName: "date.md", raw: dated, mtimeMs: NOW, now: NOW })?.due).toBe(
      "2026-10-12",
    );
    expect(dated).toContain(`custom: keep${eol}`);
    expect(dated).toContain("# Café");
    const cleared = applyCardPatch(dated, { actor: "Jake", due: null }, NOW);
    expect(
      cardToTask({ fileName: "date.md", raw: cleared, mtimeMs: NOW, now: NOW })?.due,
    ).toBeNull();
    expect(cleared).not.toMatch(/^due:/m);
  });
});

describe("editable milestones", () => {
  it("keeps legacy cards readable when their milestone is not a version", () => {
    expect(
      cardToTask({
        fileName: "legacy.md",
        raw: card("id: task-legacy\nname: Legacy\nmilestone: Alpha"),
        mtimeMs: NOW,
        now: NOW,
      })?.milestone,
    ).toBeNull();
  });
  it("creates, reads, updates and clears a milestone while preserving other card fields", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "task-board-milestone-"));
    try {
      const created = createCardFile(
        root,
        {
          title: "Plan release",
          actor: "Jake",
          due: "2026-10-12",
          milestone: "0.22.0",
        },
        NOW,
      );
      expect(
        cardToTask({ fileName: created.fileName, raw: created.raw, mtimeMs: NOW, now: NOW }),
      ).toMatchObject({
        milestone: "0.22.0",
        due: "2026-10-12",
      });
      const updated = applyCardPatch(created.raw, { actor: "Jake", milestone: "1.0.0" }, NOW);
      expect(
        cardToTask({ fileName: created.fileName, raw: updated, mtimeMs: NOW, now: NOW })?.milestone,
      ).toBe("1.0.0");
      const cleared = applyCardPatch(updated, { actor: "Jake", milestone: null }, NOW);
      expect(
        cardToTask({ fileName: created.fileName, raw: cleared, mtimeMs: NOW, now: NOW })?.milestone,
      ).toBeNull();
      expect(cleared).not.toMatch(/^milestone:/m);
      expect(cleared).toContain('due: "2026-10-12"');
    } finally {
      NodeFS.rmSync(root, { recursive: true, force: true });
    }
  });
});
const card = (header: string, body = "# Title\n\nSome words.\n", eol = "\n") =>
  `---\n${header}\n---\n${body}`.replace(/\n/g, eol);

describe("parseFrontmatter", () => {
  it("handles quoted scalars, block lists, inline lists and unknown keys", () => {
    const parsed = parseFrontmatter(
      card(
        [
          'name: "Say \\"hi\\" \\\\ there"',
          "title: 'it''s'",
          "status: In progress",
          "start_files:",
          '  - "a.ts"',
          "  - b.ts",
          "tags: [one, \"two, three\", 'four']",
          'taste: ""',
          "empty:",
          "unknown_key: kept",
        ].join("\n"),
      ),
    );
    expect(parsed?.fields).toEqual({
      name: 'Say "hi" \\ there',
      title: "it's",
      status: "In progress",
      start_files: ["a.ts", "b.ts"],
      tags: ["one", "two, three", "four"],
      taste: "",
      empty: "",
      unknown_key: "kept",
    });
    expect(parsed?.body).toBe("# Title\n\nSome words.\n");
  });

  it("reads CRLF and a UTF-8 BOM", () => {
    const parsed = parseFrontmatter(
      "\uFEFF" + card('name: "A"\nstatus: Done', "# A\nbody\n", "\r\n"),
    );
    expect(parsed?.fields).toEqual({ name: "A", status: "Done" });
    expect(parsed?.body).toBe("# A\r\nbody\r\n");
  });

  it("returns null without frontmatter", () => {
    expect(parseFrontmatter("# just a note\n")).toBeNull();
    expect(parseFrontmatter("---\nname: x\nno closing line\n")).toBeNull();
  });
});

describe("priority mapping", () => {
  it("reads the old Now and Next words as high and medium", () => {
    const priorityOf = (word: string) =>
      cardToTask({
        fileName: "p.md",
        raw: `---
id: task-p
name: "P"
priority: ${word}
---
# P
`,
        mtimeMs: NOW,
        now: NOW,
      })?.priority;
    expect(priorityOf("Now")).toBe("high");
    expect(priorityOf('"Next"')).toBe("medium");
    expect(priorityOf('"Critical"')).toBe("critical");
    // SimplyGersi cards use Now / Next / Someday.
    expect(priorityOf('"Someday"')).toBe("low");
  });
});

describe("project links", () => {
  it("reads a project.md path as the project slug", () => {
    const slugOf = (value: string) =>
      cardToTask({
        fileName: "p.md",
        raw: `---
id: task-p
name: "P"
project: ${value}
---
# P
`,
        mtimeMs: NOW,
        now: NOW,
      })?.projectSlug;
    expect(slugOf('"projects/simplygersi-command-center/project.md"')).toBe(
      "simplygersi-command-center",
    );
    expect(slugOf('"leonidas-code"')).toBe("leonidas-code");
  });
});

describe("status mapping", () => {
  it("maps card spellings and aliases both ways", () => {
    expect(statusFromCard("Not started")).toBe("todo");
    expect(statusFromCard("IN PROGRESS")).toBe("in_progress");
    expect(statusFromCard("in_progress")).toBe("in_progress");
    expect(statusFromCard("active")).toBe("in_progress");
    expect(statusFromCard("Awaiting Review")).toBe("review");
    expect(statusFromCard("Blocked")).toBe("blocked");
    expect(statusFromCard("completed")).toBe("done");
    expect(statusFromCard("finished")).toBe("done");
    expect(statusFromCard("Dormant")).toBe("parked");
    expect(statusFromCard("Retired")).toBe("retired");
    expect(statusFromCard("whatever")).toBe("todo");
    expect(statusFromCard(undefined)).toBe("todo");
    expect(statusToCard("review")).toBe("Awaiting Review");
    expect(statusToCard("parked")).toBe("Dormant");
    expect(statusToCard("in_progress")).toBe("In progress");
  });
});

describe("cardToTask", () => {
  const base = { mtimeMs: NOW, now: NOW };

  it("maps a full card", () => {
    const task = cardToTask({
      ...base,
      fileName: "Do The Thing.md",
      raw: card(
        [
          "type: task",
          "id: task-do-the-thing",
          'name: "Do the thing"',
          'status: "In progress"',
          "owner: leonidas",
          'accountable: "Jake"',
          'priority: "High"',
          'energy_type: "Deep Work"',
          'effort: "Medium"',
          "created: 2026-10-01",
          "last_touched: 2026-10-05",
          'project: "projects/Project-Leonidas-Code"',
          'lane: "leonidas"',
          "tags: [alpha, beta]",
          'verify: "pytest"',
          'due: "2026-10-20"',
          'start_files: ["a.ts", "b.ts"]',
          "blocked_by:",
          '  - "tasks/other.md"',
          'claimed_by: "Mob"',
          'thread_id: "thread-1"',
        ].join("\n"),
        "\n# Do the thing\n\nWhy.\n\n## Done when\n\n- [x] one\n- [ ] two\n  - [X] three\n\n## Notes\n\n- [ ] not counted\n",
      ),
    });
    expect(task).toMatchObject({
      id: "task-do-the-thing",
      title: "Do the thing",
      status: "in_progress",
      priority: "high",
      project: "leonidas-code",
      projectSlug: "leonidas-code",
      effort: "Medium",
      energy: "Deep Work",
      due: "2026-10-20",
      verify: "pytest",
      startFiles: ["a.ts", "b.ts"],
      blockedBy: ["tasks/other.md"],
      labels: ["alpha", "beta", "leonidas"],
      claimedBy: "Mob",
      claimedAgent: { threadId: "thread-1" },
      completedBy: null,
      source: "aios_card",
      sourceId: "task-do-the-thing",
      sourceFile: "Do The Thing.md",
      issueUrl: null,
      shared: false,
      checklist: { done: 2, total: 3 },
    });
    expect(task?.description.startsWith("Why.")).toBe(true);
    expect(task?.description).not.toContain("# Do the thing");
    expect(task?.createdAt).toBe(new Date(2026, 9, 1).getTime());
    expect(task?.updatedAt).toBe(NOW);
  });

  it("derives a stable id from the filename and keeps domain slugs", () => {
    const raw = card('name: "Pay"\nproject: "domains/finances"');
    const a = cardToTask({ ...base, fileName: "Pay The Rent!.md", raw });
    expect(a?.id).toBe("task-pay-the-rent");
    expect(a?.projectSlug).toBe("domains/finances");
    expect(a?.sourceId).toBe("Pay The Rent!");
    expect(cardToTask({ ...base, fileName: "Pay The Rent!.md", raw })?.id).toBe(a?.id);
  });

  it("falls back to general, ignores non-task cards and does not invent a claimer", () => {
    const task = cardToTask({
      ...base,
      fileName: "x.md",
      raw: card('name: "X"\naccountable: "Jake"'),
    });
    expect(task).toMatchObject({
      project: "general",
      projectSlug: null,
      claimedBy: null,
      claimedAgent: null,
    });
    expect(
      cardToTask({ ...base, fileName: "i.md", raw: card("type: index\nname: Index") }),
    ).toBeNull();
    expect(cardToTask({ ...base, fileName: "n.md", raw: "# no frontmatter\n" })).toBeNull();
    expect(cardToTask({ ...base, fileName: "n.md", raw: card("owner: leonidas") })).toBeNull();
  });

  it("fills completion fields for Done cards", () => {
    const task = cardToTask({
      ...base,
      fileName: "d.md",
      raw: card(
        'name: "D"\nstatus: "Done"\naccountable: "Jake"\nlast_touched: 2026-10-02\ncompleted_date: 2026-10-03',
        "# D\n\n## Resolution & AI Depth\n\n- **Resolution Summary:** Shipped it.\n",
      ),
    });
    expect(task).toMatchObject({
      status: "done",
      completedBy: "Jake",
      completedAt: new Date(2026, 9, 3).getTime(),
      completionSummary: "Shipped it.",
    });
  });

  it("parses the Activity section into history and keeps it out of the description", () => {
    const task = cardToTask({
      ...base,
      fileName: "a.md",
      raw: card(
        'id: task-a\nname: "A"',
        "# A\n\nBody.\n\n## Activity\n\n- 2026-10-11 09:05 Jake (Claude Opus): claimed — starting\n- 2026-10-11 10:00 Mob: status → Blocked\n- 2026-10-11 11:00 Mob: completed\n\n## After\n\ntail\n",
      ),
    });
    expect(task?.description).toBe("Body.\n\n## After\n\ntail");
    expect(task?.history).toHaveLength(3);
    expect(task?.history[0]).toMatchObject({
      id: "task-a-act-0",
      action: "claimed",
      actor: "Jake",
      note: "starting",
      agent: { model: "Claude Opus" },
      timestamp: new Date(2026, 9, 11, 9, 5).getTime(),
    });
    expect(task?.history[1]).toMatchObject({ action: "progress", note: "status → Blocked" });
    expect(task?.history[2]).toMatchObject({ action: "completed", note: null });
  });
});

describe("applyCardPatch", () => {
  const header = [
    "type: task",
    "id: task-a",
    'name: "A"',
    'status: "Not started"',
    'priority: "Medium"',
    "created: 2026-10-01",
    "last_touched: 2026-10-01",
    "start_files:",
    '  - "x.ts"',
    "mystery_key:   spaced   value",
    "# stray comment",
  ].join("\n");
  const patchBase = { actor: "Jake" } as const;

  it("writes effort and labels onto the card and reads them back", () => {
    const next = applyCardPatch(
      card(header),
      { ...patchBase, effort: "Low", labels: ["bug", "ui"] },
      NOW,
    );
    expect(next).toContain('effort: "Low"');
    expect(next).toContain('tags: ["bug", "ui"]');
    expect(next).toContain("effort → Low, labels → bug, ui");
    const task = cardToTask({ fileName: "a.md", raw: next, mtimeMs: NOW, now: NOW });
    expect(task).toMatchObject({ effort: "Low", labels: ["bug", "ui"] });
  });

  it("round-trips a claim through cardToTask", () => {
    const raw = card(header);
    const next = applyCardPatch(
      raw,
      {
        ...patchBase,
        status: "in_progress",
        claimedBy: "Jake",
        agentLabel: "Claude",
        threadId: "t-9",
      },
      NOW,
    );
    expect(next).toContain('status: "In progress"');
    expect(next).toContain('claimed_by: "Jake"');
    expect(next).toContain('thread_id: "t-9"');
    expect(next).toContain("last_touched: 2026-10-11");
    expect(next).toContain("## Activity\n\n- 2026-10-11 14:30 Jake (Claude): claimed\n");

    const task = cardToTask({ fileName: "a.md", raw: next, mtimeMs: NOW, now: NOW });
    expect(task).toMatchObject({
      status: "in_progress",
      claimedBy: "Jake",
      claimedAgent: { threadId: "t-9" },
      claimedAt: NOW,
    });
    expect(task?.history).toHaveLength(1);
    expect(task?.history[0]).toMatchObject({
      action: "claimed",
      actor: "Jake",
      agent: { model: "Claude" },
    });
  });

  it("keeps every chat that worked on a card, newest as the main thread", () => {
    const first = applyCardPatch(card(header), { ...patchBase, threadId: "t-1" }, NOW);
    const second = applyCardPatch(first, { ...patchBase, threadId: "t-2" }, NOW);
    const again = applyCardPatch(second, { ...patchBase, threadId: "t-2" }, NOW);
    expect(second).toContain('thread_id: "t-2"');
    expect(second).toContain('thread_ids: ["t-1", "t-2"]');
    expect(again).toBe(second);

    const task = cardToTask({ fileName: "a.md", raw: second, mtimeMs: NOW, now: NOW });
    expect(task?.threadIds).toEqual(["t-1", "t-2"]);
    expect(task?.claimedAgent?.threadId).toBe("t-2");
  });

  it("keeps the thread list when a release clears the main thread", () => {
    const claimed = applyCardPatch(
      card(header),
      { ...patchBase, status: "in_progress", claimedBy: "Jake", threadId: "t-1" },
      NOW,
    );
    const released = applyCardPatch(claimed, { ...patchBase, claimedBy: null }, NOW);
    expect(released).not.toContain("thread_id:");
    const task = cardToTask({ fileName: "a.md", raw: released, mtimeMs: NOW, now: NOW });
    expect(task?.threadIds).toEqual(["t-1"]);
  });

  it("reads an older card with one thread_id as a one-chat list", () => {
    const task = cardToTask({
      fileName: "a.md",
      raw: card(`${header}\nthread_id: "thread-1"`),
      mtimeMs: NOW,
      now: NOW,
    });
    expect(task?.threadIds).toEqual(["thread-1"]);
  });

  it("keeps every untouched line byte for byte", () => {
    const raw = card(header);
    const next = applyCardPatch(raw, { ...patchBase, priority: "high" }, NOW);
    const untouched = [
      "mystery_key:   spaced   value",
      "# stray comment",
      "start_files:",
      '  - "x.ts"',
      "created: 2026-10-01",
    ];
    for (const line of untouched) expect(next).toContain(`${line}\n`);
    expect(next).toContain('priority: "High"');
    expect(
      next
        .split("\n")
        .filter((line) => !line.startsWith("priority") && !line.startsWith("last_touched"))
        .slice(0, 11),
    ).toEqual(
      raw
        .split("\n")
        .filter((line) => !line.startsWith("priority") && !line.startsWith("last_touched"))
        .slice(0, 11),
    );
  });

  it("preserves CRLF and the BOM, including in the appended activity", () => {
    const raw = "\uFEFF" + card(header, "# A\n\nBody.\n", "\r\n");
    const next = applyCardPatch(raw, { ...patchBase, status: "done" }, NOW);
    expect(next.startsWith("\uFEFF---\r\n")).toBe(true);
    expect(next.replace(/\r\n/g, "")).not.toContain("\n");
    expect(next).toContain('status: "Done"\r\n');
    expect(next).toContain("completed_date: 2026-10-11\r\n");
    expect(next).toMatch(
      /Body\.\r\n\r\n## Activity\r\n\r\n- 2026-10-11 14:30 Jake: completed\r\n$/,
    );
  });

  it("sets and clears completed_date, project, claimed_by and thread_id", () => {
    const done = applyCardPatch(
      card(header),
      { ...patchBase, status: "done", projectSlug: "leonidas-code" },
      NOW,
    );
    expect(done).toContain('project: "leonidas-code"');
    expect(done).toContain("linked to project leonidas-code");
    const reopened = applyCardPatch(
      done,
      { ...patchBase, status: "in_progress", claimedBy: "Mob", threadId: "t" },
      NOW,
    );
    expect(reopened).not.toContain("completed_date");
    expect(reopened).toContain("reopened");
    const released = applyCardPatch(
      reopened,
      { ...patchBase, status: "todo", claimedBy: null, projectSlug: null },
      NOW,
    );
    expect(released).not.toContain("claimed_by");
    expect(released).not.toContain("thread_id:");
    expect(released).toContain('thread_ids: ["t"]');
    expect(released).not.toMatch(/^project:/m);
    const task = cardToTask({ fileName: "a.md", raw: released, mtimeMs: NOW, now: NOW });
    expect(task).toMatchObject({ status: "todo", claimedBy: null, projectSlug: null });
    expect(task?.history.map((entry) => entry.action)).toEqual([
      "completed",
      "reopened",
      "released",
    ]);
  });

  it("appends to an Activity section that is not last, and adds notes", () => {
    const raw = card(
      header,
      "# A\n\n## Activity\n\n- 2026-10-10 08:00 Mob: claimed\n\n## Later\n\ntext\n",
    );
    const next = applyCardPatch(raw, { ...patchBase, note: "half done" }, NOW);
    expect(next).toContain(
      "- 2026-10-10 08:00 Mob: claimed\n- 2026-10-11 14:30 Jake: progress - half done\n\n## Later\n\ntext\n",
    );
  });

  it("writes notes with a hyphen and reads them back, old em dash lines included", () => {
    const next = applyCardPatch(
      card(header),
      { ...patchBase, claimedBy: "Jake", note: "starting" },
      NOW,
    );
    expect(next).not.toContain(String.fromCharCode(0x2014));
    const legacy = `- 2026-10-10 08:00 Mob: completed ${String.fromCharCode(0x2014)} shipped
`;
    const task = cardToTask({ fileName: "a.md", raw: next + legacy, mtimeMs: NOW, now: NOW });
    expect(task?.history.map((entry) => [entry.action, entry.note])).toEqual([
      ["claimed", "starting"],
      ["completed", "shipped"],
    ]);
  });

  it("returns the card untouched when nothing changes and rejects cards without frontmatter", () => {
    const raw = card(header);
    expect(applyCardPatch(raw, { ...patchBase, status: "todo", priority: "medium" }, NOW)).toBe(
      raw,
    );
    expect(() => applyCardPatch("# nope\n", patchBase, NOW)).toThrow("invalid_card");
  });

  it("records shared sync state without logging activity, and drops it when sharing stops", () => {
    const shared = applyCardPatch(card(header), { ...patchBase, shared: true }, NOW);
    const failed = applyCardPatch(shared, { ...patchBase, sharedSync: "failed" }, NOW);
    expect(failed).toContain("shared_sync: failed\n");
    expect(failed.split("Jake:").length).toBe(shared.split("Jake:").length);
    expect(cardToTask({ fileName: "a.md", raw: failed, mtimeMs: NOW, now: NOW })).toMatchObject({
      sharedSync: "failed",
    });
    expect(applyCardPatch(failed, { ...patchBase, sharedSync: null }, NOW)).toBe(shared);
    const withdrawn = applyCardPatch(failed, { ...patchBase, shared: false }, NOW);
    expect(withdrawn).not.toMatch(/^shared_sync:/m);
  });

  it("writes and removes the shared keys and reads them back", () => {
    const raw = card(header);
    expect(cardToTask({ fileName: "a.md", raw, mtimeMs: NOW, now: NOW })).toMatchObject({
      shared: false,
    });

    const shared = applyCardPatch(raw, { ...patchBase, shared: true, sharedBy: "Jake" }, NOW);
    expect(shared).toContain("shared: true\n");
    expect(shared).toContain('shared_by: "Jake"\n');
    expect(shared).toContain("Jake: shared with collaborators");
    const task = cardToTask({ fileName: "a.md", raw: shared, mtimeMs: NOW, now: NOW });
    expect(task).toMatchObject({ shared: true, sharedBy: "Jake" });

    // Sharing again by the same person changes nothing.
    expect(applyCardPatch(shared, { ...patchBase, shared: true, sharedBy: "Jake" }, NOW)).toBe(
      shared,
    );

    const withdrawn = applyCardPatch(shared, { ...patchBase, shared: false }, NOW);
    expect(withdrawn).not.toMatch(/^shared(_by)?:/m);
    expect(withdrawn).toContain("stopped sharing");
    const after = cardToTask({ fileName: "a.md", raw: withdrawn, mtimeMs: NOW, now: NOW });
    expect(after).toMatchObject({ shared: false });
    expect(after).not.toHaveProperty("sharedBy");
    // Clearing a card that is not shared is a no-op.
    expect(applyCardPatch(raw, { ...patchBase, shared: null }, NOW)).toBe(raw);
  });
});

describe("AIOS folder reading", () => {
  let root = "";
  let symlinks = true;

  beforeAll(() => {
    root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "aios-cards-"));
    const write = (relative: string, content: string) => {
      const file = NodePath.join(root, relative);
      NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
      NodeFS.writeFileSync(file, content);
    };
    write(
      "tasks/alpha.md",
      card('id: task-alpha\nname: "Alpha"\nstatus: "Not started"\nproject: "beta"'),
    );
    write(
      "tasks/crlf.md",
      "\uFEFF" + card('id: task-crlf\nname: "Crlf"\nstatus: "Done"', "# Crlf\n", "\r\n"),
    );
    write("tasks/README.md", "# readme\n");
    write("tasks/tasks-index.md", card("type: index\nname: Index"));
    write("tasks/_staged/hidden.md", card('name: "Hidden"'));
    write("tasks/broken.md", "---\nname: [unclosed\n");
    write("projects/beta/tasks/local.md", card('id: task-local\nname: "Local"'));
    write(
      "projects/beta/project.md",
      '---\ntype: project\nname: "Frontmatter Name"\n---\n# Beta Project\n',
    );
    write(
      "projects/leonidas-code/project.md",
      '---\ntype: project\nname: "Leonidas"\n---\n# Leonidas: project ledger\n',
    );
    write("projects/projects-index.md", "# index\n");
    write("projects/_archive/x/project.md", "# no\n");
    try {
      NodeFS.symlinkSync(
        NodePath.join(root, "tasks", "alpha.md"),
        NodePath.join(root, "projects", "beta", "tasks", "alpha.md"),
      );
    } catch {
      symlinks = false;
    }
  });

  afterAll(() => {
    NodeFS.rmSync(root, { recursive: true, force: true });
  });

  it("finds the root from hints and ancestors", () => {
    const deep = NodePath.join(root, "projects", "beta");
    expect(findAiosRoot([undefined, "", NodePath.join(root, "nope"), deep])).toBe(root);
    expect(findAiosRoot([root])).toBe(root);
    expect(findAiosRoot([NodePath.join(root, "nope", "deeper")])).toBe(root);
    expect(findAiosRoot([NodePath.join(NodeOS.tmpdir(), "no-such-aios-dir-xyz")])).toBeNull();
  });

  it("reads global and project cards, skips noise and dedupes symlinked cards", () => {
    const tasks = readAiosTasks(root, { now: NOW });
    const ids = tasks.map((task) => task.id).sort();
    expect(ids).toEqual(["task-alpha", "task-crlf", "task-local"]);
    expect(tasks.find((task) => task.id === "task-local")?.projectSlug).toBe("beta");
    expect(tasks.find((task) => task.id === "task-alpha")?.projectSlug).toBe("beta");
    expect(tasks.find((task) => task.id === "task-crlf")?.status).toBe("done");
  });

  it("reuses cached parses for unchanged files only", () => {
    const cache: AiosCardCache = new Map();
    const first = readAiosTasks(root, { now: NOW, cache });
    expect(cache.size).toBeGreaterThanOrEqual(first.length);
    // The symlinked copy of alpha.md resolves to a file already read, so it adds no cache entry.
    if (symlinks) expect(cache.size).toBe(5);
    const sentinel = [...cache.entries()].find(([, entry]) => entry.task?.id === "task-local");
    expect(sentinel).toBeDefined();
    const [file, entry] = sentinel!;
    cache.set(file, { ...entry, task: { ...entry.task!, title: "From cache" } });
    expect(
      readAiosTasks(root, { now: NOW, cache }).find((task) => task.id === "task-local")?.title,
    ).toBe("From cache");
    cache.set(file, { ...entry, size: entry.size + 1, task: { ...entry.task!, title: "Stale" } });
    expect(
      readAiosTasks(root, { now: NOW, cache }).find((task) => task.id === "task-local")?.title,
    ).toBe("Local");
  });

  it("keeps the global card when two cards share an id", () => {
    NodeFS.writeFileSync(
      NodePath.join(root, "projects", "beta", "tasks", "dup.md"),
      card('id: task-alpha\nname: "Dup"'),
    );
    try {
      const alpha = readAiosTasks(root, { now: NOW }).filter((task) => task.id === "task-alpha");
      expect(alpha).toHaveLength(1);
      expect(alpha[0]?.title).toBe("Alpha");
    } finally {
      NodeFS.rmSync(NodePath.join(root, "projects", "beta", "tasks", "dup.md"));
    }
  });

  it("reads one card file with the same project as a full scan", () => {
    const cache: AiosCardCache = new Map();
    const local = readAiosCardFile(
      root,
      NodePath.join(root, "projects", "beta", "tasks", "local.md"),
      {
        now: NOW,
        cache,
      },
    );
    expect(local?.id).toBe("task-local");
    expect(local?.projectSlug).toBe("beta");
    expect(
      readAiosCardFile(root, NodePath.join(root, "tasks", "crlf.md"), { now: NOW, cache })?.id,
    ).toBe("task-crlf");
    expect(cache.size).toBe(2);
  });

  it("returns an empty list for a missing root", () => {
    expect(readAiosTasks(NodePath.join(root, "missing"), { now: NOW })).toEqual([]);
  });

  it("finds card files for editing", () => {
    expect(findCardFile(root, "alpha.md")).toBe(NodePath.join(root, "tasks", "alpha.md"));
    expect(findCardFile(root, "local.md")).toBe(
      NodePath.join(root, "projects", "beta", "tasks", "local.md"),
    );
    expect(findCardFile(root, "../alpha.md")).toBeNull();
    expect(findCardFile(root, "missing.md")).toBeNull();
  });

  it("discovers projects with names from project.md or the slug", () => {
    const projects = discoverProjects(root);
    expect(projects.map((project) => project.slug).sort()).toEqual(["beta", "leonidas-code"]);
    expect(projects.find((project) => project.slug === "beta")?.name).toBe("Frontmatter Name");
    expect(projects.find((project) => project.slug === "leonidas-code")?.name).toBe("Leonidas");
  });

  it("creates uniquely named cards and never overwrites", () => {
    const first = createCardFile(
      root,
      {
        title: "Write the Docs!",
        description: "Details.",
        priority: "high",
        projectSlug: "beta",
        actor: "Jake",
      },
      NOW,
    );
    const second = createCardFile(root, { title: "Write the Docs!", actor: "Jake" }, NOW);
    expect(first.fileName).toBe("write-the-docs.md");
    expect(second.fileName).toBe("write-the-docs-2.md");
    expect(second.id).toBe("task-write-the-docs-2");
    expect(NodeFS.readFileSync(NodePath.join(root, "tasks", first.fileName), "utf8")).toBe(
      first.raw,
    );
    expect(first.raw).toContain('priority: "High"');
    expect(first.raw).toContain('project: "beta"');
    expect(second.raw).not.toContain("project:");
    expect(second.raw).not.toContain("effort:");
    expect(
      createCardFile(root, { title: "x".repeat(300), actor: "Jake" }, NOW).fileName.length,
    ).toBeLessThanOrEqual(83);

    const task = cardToTask({ fileName: first.fileName, raw: first.raw, mtimeMs: NOW, now: NOW });
    expect(task).toMatchObject({
      id: first.id,
      title: "Write the Docs!",
      status: "todo",
      priority: "high",
      description: "Details.",
    });
  });
});

describe("resolveMember", () => {
  it("prefers LEONIDAS_MEMBER and otherwise returns something non-empty", () => {
    expect(resolveMember({ LEONIDAS_MEMBER: " Mob " })).toBe("Mob");
    expect(resolveMember({}).length).toBeGreaterThan(0);
  });
});

describe("real AIOS", () => {
  const realRoot = "D:/Leonidas AIOS";
  // Opt in with LEONIDAS_REAL_AIOS_TEST=1: it reads the live AIOS against a wall-clock budget.
  it.skipIf(process.env.LEONIDAS_REAL_AIOS_TEST !== "1" || !NodeFS.existsSync(`${realRoot}/tasks`))(
    "reads every real card quickly",
    () => {
      const started = performance.now();
      const tasks = readAiosTasks(realRoot, { now: Date.now() });
      const elapsed = performance.now() - started;
      expect(tasks.length).toBeGreaterThan(100);
      for (const task of tasks) {
        expect(task.id).not.toBe("");
        expect(task.title).not.toBe("");
      }
      expect(new Set(tasks.map((task) => task.id)).size).toBe(tasks.length);
      expect(elapsed).toBeLessThan(500);

      const cache: AiosCardCache = new Map();
      readAiosTasks(realRoot, { now: Date.now(), cache });
      const warmStarted = performance.now();
      readAiosTasks(realRoot, { now: Date.now(), cache });
      expect(performance.now() - warmStarted).toBeLessThan(150);
    },
  );
});

describe("task owners and agent runs", () => {
  const read = (raw: string) => cardToTask({ fileName: "own.md", raw, mtimeMs: NOW, now: NOW });

  it("takes the owner from assignee, then from a person's build lane", () => {
    expect(read(card('id: task-a\nname: "A"\nassignee: "Mob"'))?.assignee).toBe("Mob");
    expect(read(card('id: task-b\nname: "B"\nbuild_lane: Mob after Jake go'))?.assignee).toBe(
      "Mob",
    );
    expect(read(card('id: task-c\nname: "C"\nbuild_lane: grill'))?.assignee).toBeNull();
  });

  it("sets and clears the owner with an activity line", () => {
    const raw = card('id: task-d\nname: "D"');
    const owned = applyCardPatch(raw, { actor: "Jake", assignee: "Jake" }, NOW);
    expect(read(owned)?.assignee).toBe("Jake");
    expect(owned).toContain("assigned to Jake");
    const freed = applyCardPatch(owned, { actor: "Jake", assignee: null }, NOW);
    expect(read(freed)?.assignee).toBeNull();
    expect(freed).toContain("made available to anyone");
  });

  it("marks chat requests as agent runs, declared or from the auto-log note", () => {
    expect(read(card('id: task-e\nname: "E"\nkind: agent_run'))?.kind).toBe("agent_run");
    const legacy = card(
      'id: task-f\nname: "F"',
      "# F\n\n## Activity\n\n- 2026-10-14 02:32 Leonidas: status → In progress — Agent started on this request. [message m1]\n",
    );
    expect(read(legacy)?.kind).toBe("agent_run");
    expect(read(card('id: task-g\nname: "G"'))?.kind).toBeUndefined();
  });
});

describe("game card board fields", () => {
  const game = (extra: string, owner = "jake") =>
    `---\nid: GB-020\ntitle: "Tune prices"\nowner: ${owner}\nsystem: Economy\nstatus: todo\npriority: P2\ndepends: []\ndue: 2026-10-20\n${extra}---\n\n## Goal\nTune it.\n`;
  const read = (raw: string) =>
    cardToTask({
      fileName: "GB-020-x.md",
      raw,
      mtimeMs: NOW,
      now: NOW,
      projectHint: "rent-due-games",
    });

  it("maps owner to the board assignee", () => {
    expect(read(game(""))?.assignee).toBe("Jake");
    expect(read(game("", "mob"))?.assignee).toBe("Mob");
    expect(read(game("", "Mob"))?.assignee).toBe("Mob");
    expect(read(game("", "either"))?.assignee).toBeNull();
  });

  it("maps system to a system label and keeps due", () => {
    const task = read(game(""));
    expect(task?.labels).toContain("system:Economy");
    expect(task?.due).toBe("2026-10-20");
  });

  it("does not add game fields to a card without owner and system", () => {
    const task = read('---\nid: task-a\nname: "A"\nowner: leonidas\nstatus: todo\n---\n');
    expect(task?.assignee).toBeNull();
    expect(task?.labels).toEqual([]);
  });

  it("reads depends as blockedBy and drops dependencies that are done", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "task-board-game-dep-"));
    try {
      const dir = NodePath.join(root, "projects", "rent-due-games", "clean-the-goo");
      NodeFS.mkdirSync(NodePath.join(dir, ".git"), { recursive: true });
      NodeFS.mkdirSync(NodePath.join(dir, "tasks"));
      NodeFS.mkdirSync(NodePath.join(root, "tasks"));
      const card = (id: string, status: string, depends: string) =>
        `---\nid: ${id}\ntitle: "${id}"\nowner: mob\nsystem: Pipeline\nstatus: ${status}\npriority: P1\ndepends: ${depends}\n---\n`;
      NodeFS.writeFileSync(
        NodePath.join(dir, "tasks", "GB-001-a.md"),
        card("GB-001", "done", "[]"),
      );
      NodeFS.writeFileSync(
        NodePath.join(dir, "tasks", "GB-002-b.md"),
        card("GB-002", "doing", "[]"),
      );
      NodeFS.writeFileSync(
        NodePath.join(dir, "tasks", "GB-003-c.md"),
        card("GB-003", "todo", "[GB-001, GB-002, GB-404]"),
      );
      NodeFS.writeFileSync(
        NodePath.join(dir, "tasks", "GB-004-d.md"),
        card("GB-004", "todo", "\n  - GB-002"),
      );
      const cache: AiosCardCache = new Map();
      for (let pass = 0; pass < 2; pass++) {
        const byId = new Map(readAiosTasks(root, { now: NOW, cache }).map((t) => [t.id, t]));
        expect(byId.get("GB-003")?.blockedBy).toEqual(["GB-002", "GB-404"]);
        expect(byId.get("GB-004")?.blockedBy).toEqual(["GB-002"]);
        expect(byId.get("GB-001")?.blockedBy).toEqual([]);
      }
    } finally {
      NodeFS.rmSync(root, { recursive: true, force: true });
    }
  });

  const changedLines = (before: string, after: string) => {
    const a = before.split("\n");
    const b = after.split("\n");
    expect(b.length).toBe(a.length);
    return a.flatMap((line, i) => (line === b[i] ? [] : [[line, b[i]!]]));
  };

  it("changes exactly one line when the status changes", () => {
    const before = game("");
    const after = applyCardPatch(before, { actor: "Jake", status: "in_progress" }, NOW);
    expect(changedLines(before, after)).toEqual([["status: todo", "status: doing"]]);
  });

  it("changes exactly one line when the priority changes", () => {
    const before = game("");
    const after = applyCardPatch(before, { actor: "Jake", priority: "critical" }, NOW);
    expect(changedLines(before, after)).toEqual([["priority: P2", "priority: P0"]]);
  });

  it("writes an owner change back to the owner line", () => {
    const before = game("");
    expect(
      changedLines(before, applyCardPatch(before, { actor: "J", assignee: "Mob" }, NOW)),
    ).toEqual([["owner: jake", "owner: mob"]]);
    expect(
      changedLines(before, applyCardPatch(before, { actor: "J", assignee: null }, NOW)),
    ).toEqual([["owner: jake", "owner: either"]]);
  });

  it("writes no last_touched, completed_date or Activity section", () => {
    const after = applyCardPatch(game(""), { actor: "Jake", status: "done", note: "x" }, NOW);
    expect(after).not.toMatch(/last_touched|completed_date|## Activity/);
    expect(after).toMatch(/^status: done$/m);
  });

  it("returns the card untouched when only a note is given", () => {
    const before = game("");
    expect(applyCardPatch(before, { actor: "Jake", note: "hello" }, NOW)).toBe(before);
  });

  it("keeps CRLF endings, the BOM and the field order", () => {
    const before =
      "\uFEFF" + game("files:\r\n  - a.lua\r\n").replace(/\n/g, "\r\n").replace(/\r\r/g, "\r");
    const after = applyCardPatch(
      before,
      { actor: "Jake", status: "in_progress", priority: "high" },
      NOW,
    );
    expect(after.charCodeAt(0)).toBe(0xfeff);
    expect(after.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(after).toBe(
      before.replace("status: todo", "status: doing").replace("priority: P2", "priority: P1"),
    );
  });

  it("keeps a card that ends right after the closing fence", () => {
    const before = "---\nid: GB-021\nowner: mob\nsystem: UI\nstatus: todo\npriority: P1\n---";
    expect(applyCardPatch(before, { actor: "J", status: "in_progress" }, NOW)).toBe(
      before.replace("status: todo", "status: doing"),
    );
  });
});

describe("Done when checklist", () => {
  const body = [
    "# A",
    "",
    "## Done when",
    "",
    "- [x] Chip shows the card",
    "- [ ] Review pops a notice",
    "  * [ ] Gate passes",
    "",
    "## Notes",
    "",
    "- [ ] not a gate",
    "",
  ].join("\n");
  const header = ["type: task", "id: task-a", 'name: "A"', 'status: "In progress"'].join("\n");

  it("lists only the Done when items, numbered from 1", () => {
    expect(doneWhenItems(body)).toEqual([
      { item: 1, text: "Chip shows the card", done: true },
      { item: 2, text: "Review pops a notice", done: false },
      { item: 3, text: "Gate passes", done: false },
    ]);
    expect(doneWhenItems("# A\n\nNo gates.\n")).toEqual([]);
  });

  it("ticks and clears items by number and logs them", () => {
    const next = applyCardPatch(
      card(header, body),
      {
        actor: "Jake",
        check: [
          { item: 2, done: true },
          { item: 1, done: false },
        ],
      },
      NOW,
    );
    expect(doneWhenItems(next)).toEqual([
      { item: 1, text: "Chip shows the card", done: false },
      { item: 2, text: "Review pops a notice", done: true },
      { item: 3, text: "Gate passes", done: false },
    ]);
    expect(next).toContain("  * [ ] Gate passes");
    expect(next).toContain("- [ ] not a gate");
    expect(next).toContain("checked 2, unchecked 1");
  });

  it("rejects an item number the card does not have", () => {
    expect(() =>
      applyCardPatch(card(header, body), { actor: "Jake", check: [{ item: 4, done: true }] }, NOW),
    ).toThrow("checklist_item");
  });

  it("keeps CRLF line endings and skips a tick that changes nothing", () => {
    const raw = card(header, body, "\r\n");
    expect(applyCardPatch(raw, { actor: "Jake", check: [{ item: 1, done: true }] }, NOW)).toBe(raw);
    const next = applyCardPatch(raw, { actor: "Jake", check: [{ item: 2, done: true }] }, NOW);
    expect(next).toContain("- [x] Review pops a notice\r\n");
  });
});

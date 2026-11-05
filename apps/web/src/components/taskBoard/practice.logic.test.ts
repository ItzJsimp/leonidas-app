import { describe, expect, it } from "vite-plus/test";

import { applyPracticePatch, PRACTICE_SLUG, practiceSeed } from "./practice.logic";
import { pickQuickBatches, suggestTriage, type TaskView } from "./taskBoard.logic";

const NOW = 1_800_000_000_000;
const asViews = (tasks: ReturnType<typeof practiceSeed>) =>
  tasks.map((task) => ({ ...task, origin: "local", section: PRACTICE_SLUG }) as TaskView);

describe("practice project", () => {
  it("seeds tasks that all belong to the practice section, with unique ids", () => {
    const tasks = practiceSeed(NOW);
    expect(new Set(tasks.map((task) => task.id)).size).toBe(tasks.length);
    expect(tasks.every((task) => task.projectSlug === PRACTICE_SLUG)).toBe(true);
  });

  it("offers a batch of small tasks to try", () => {
    const batches = pickQuickBatches(asViews(practiceSeed(NOW)));
    expect(batches).toHaveLength(1);
    expect(batches[0]!.tasks.length).toBeGreaterThanOrEqual(2);
  });

  it("renames and sets or clears property values", () => {
    const [task] = practiceSeed(NOW);
    const set = applyPracticePatch(task!, { title: "New", props: { lane: "draft" } }, "You", NOW);
    expect(set.title).toBe("New");
    expect(set.props).toEqual({ ...task!.props, lane: "draft" });
    expect(applyPracticePatch(set, { props: { lane: null } }, "You", NOW).props).not.toHaveProperty(
      "lane",
    );
  });

  it("records edits in a task's history and stamps completion", () => {
    const [task] = practiceSeed(NOW);
    const claimed = applyPracticePatch(
      task!,
      { status: "in_progress", claimedBy: "You" },
      "You",
      NOW,
    );
    expect(claimed).toMatchObject({ status: "in_progress", claimedBy: "You", claimedAt: NOW });
    expect(claimed.history).toHaveLength(1);
    const done = applyPracticePatch(claimed, { status: "done" }, "You", NOW + 1);
    expect(done).toMatchObject({ status: "done", completedAt: NOW + 1, completedBy: "You" });
    const reopened = applyPracticePatch(done, { status: "todo" }, "You", NOW + 2);
    expect(reopened).toMatchObject({ completedAt: null, completedBy: null });
  });

  it("lets Organize fill in labels on a practice task", () => {
    const task = { ...practiceSeed(NOW)[1]!, effort: null, labels: [] };
    expect(suggestTriage(task)).not.toBeNull();
  });
});

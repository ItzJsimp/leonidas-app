import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { ThreadNow } from "./ThreadNow";

const item = (id: string, title: string, description?: string) => ({
  id,
  icon: <svg data-icon={id} />,
  title,
  ...(description ? { description } : {}),
});

describe("ThreadNow", () => {
  it("renders nothing when the thread has no state", () => {
    expect(
      renderToStaticMarkup(<ThreadNow attention={null} work={null} syncPhase={null} goal={null} />),
    ).toBe("");
  });

  it("orders lines as attention, work, sync, goal and announces only attention", () => {
    const html = renderToStaticMarkup(
      <ThreadNow
        attention={item("a", "Subagent needs you")}
        work={item("w", "Running tests", "12s")}
        syncPhase="syncing"
        goal={item("g", "Goal: ship 4a")}
      />,
    );
    const order = [
      "Subagent needs you",
      "Running tests",
      "data-composer-sync-status",
      "Goal: ship 4a",
    ];
    const positions = order.map((text) => html.indexOf(text));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(html).toContain('role="status"');
    expect(html).toContain("12s");
    expect(html.match(/data-thread-now-line="true"/g)).toHaveLength(3);
  });
});

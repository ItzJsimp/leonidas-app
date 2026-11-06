// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { WindowHeader } from "./WindowHeader";

const TABS = [
  { id: "git", label: "Git" },
  { id: "prs", label: "Pull requests" },
];

describe("WindowHeader", () => {
  it("shows the title, the count and the actions", () => {
    const html = renderToStaticMarkup(
      <WindowHeader title="Inbox" count={3} actions={<button type="button">Go</button>} />,
    );
    expect(html).toContain("Inbox");
    expect(html).toContain(">3<");
    expect(html).toContain("Go");
    expect(html).not.toContain('role="tablist"');
  });

  it("marks the active tab with the neutral underline", () => {
    const html = renderToStaticMarkup(
      <WindowHeader title="Developer" tabs={TABS} active="prs" onSelect={() => {}} />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/aria-selected="true"[^>]*class="[^"]*border-primary/);
    expect(html.match(/aria-selected="false"/g)).toHaveLength(1);
  });
});

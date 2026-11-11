// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { EXPLAIN_SIMPLER_REPLY, OutputDock, ReplyBody } from "./AssistantOutput";
import { parseOutputDock } from "@t3tools/shared/outputDock";

it("fills options, quick replies and Start, and shows old actions as plain lines", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onReply = vi.fn();
  const dock = parseOutputDock(`Body
### 🎯 TL;DR
- Ready
### ⚡ Immediate Next Actions
- [ ] 🤖 **Leonidas:** Run tests.
### ❓ Input & Decisions Needed
- **A)** Keep it.
💬 Quick Replies: "Why A?"`)!;
  const done = parseOutputDock(`Shipped.
### 🎯 TL;DR
- Live
### 🏁 Session Complete
✅ Done. Next best move: retire jake.md.`)!;
  const button = (label: string) =>
    [...container.querySelectorAll("button")].find((b) => b.textContent === label)!;
  try {
    await act(() =>
      root.render(
        <>
          <OutputDock
            sections={dock.sections}
            onReply={onReply}
            renderMarkdown={(text) => <span>{text}</span>}
          />
          <OutputDock
            sections={done.sections}
            onReply={onReply}
            renderMarkdown={(text) => <span>{text}</span>}
          />
        </>,
      ),
    );
    expect(container.querySelector('[role="checkbox"]')).toBeNull();
    expect(container.textContent).toContain("- 🤖 **Leonidas:** Run tests.");
    // A toast tells the user once that buttons fill the box, so the card carries no footer.
    expect(container.textContent).not.toContain("Buttons fill your message box");
    expect(container.querySelector("h3")?.className).toContain("uppercase");
    for (const label of ["Choose A", "Why A?", "Start"]) await act(() => button(label).click());
    expect(onReply.mock.calls).toEqual([
      ["Option A: Keep it"],
      ["Why A?"],
      ["Start: retire jake.md"],
    ]);
  } finally {
    await act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("shows the slim Dock below builder level: explain simpler, no undo, chips or checkboxes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onReply = vi.fn();
  const dock = parseOutputDock(`Done.
### 🎯 TL;DR
- Ready
🔁 Assumed: "Blue theme"
### ⚡ Immediate Next Actions
- [ ] 🤖 **Leonidas:** Run tests.`)!;
  const render = (simple: boolean) =>
    act(() =>
      root.render(
        <OutputDock
          sections={dock.sections}
          onReply={onReply}
          simple={simple}
          renderMarkdown={(text) => <span>{text}</span>}
        />,
      ),
    );
  const button = (label: string) =>
    [...container.querySelectorAll("button")].find((b) => b.textContent === label);
  try {
    await render(true);
    expect(container.querySelector('[role="checkbox"]')).toBeNull();
    expect(button("Blue theme")).toBeUndefined();
    await act(() => button("Explain simpler")!.click());
    expect(onReply).toHaveBeenLastCalledWith(EXPLAIN_SIMPLER_REPLY);
    expect(button("Undo this turn")).toBeUndefined();

    await render(false);
    expect(container.querySelector('[role="checkbox"]')).toBeNull();
    expect(button("Explain simpler")).toBeUndefined();
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});

it("shows status pills and puts a long body behind Summary and Full answer tabs", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const reply = parseOutputDock(`✅ Done · 🧠 None · 📍 Reply styles: step 2 of 7

\`\`\`leo:summary
The script is in.
It reuses five checks.
\`\`\`
line one
line two
line three
line four
---
### 🎯 TL;DR
- Ready`)!;
  const render = (body: string) =>
    act(() =>
      root.render(
        <ReplyBody
          status={reply.status}
          body={body}
          renderMarkdown={(text) => <span>{text}</span>}
        />,
      ),
    );
  try {
    await render(reply.body);
    const status = container.querySelector("[data-status-bar]")!;
    expect(status.textContent).toContain("Done");
    expect(status.textContent).toContain("No thought needed");
    expect(status.textContent).toContain("Reply styles: step 2 of 7");
    // Beta users missed the old Details fold: the summary tab shows the start of the answer.
    expect(container.textContent).not.toContain("Details");
    expect(container.textContent).toContain("The script is in.");
    expect(container.textContent).not.toContain("line one");
    expect(container.textContent).not.toContain("leo:summary");
    const tabs = [...container.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Summary", "Full answer8 words"]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    await act(() => tabs[1]!.click());
    expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
    expect(container.textContent).toContain("line four");
    expect(container.textContent).not.toContain("The script is in.");

    // No summary block: the whole reply shows, with no tabs, however long it is.
    await render("one\ntwo\nthree\nfour\nfive");
    expect(container.textContent).toContain("five");
    expect(container.querySelector('[role="tab"]')).toBeNull();

    await render("short body");
    expect(container.textContent).toContain("short body");
    expect(container.querySelector('[role="tab"]')).toBeNull();
  } finally {
    await act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});

it("splits the agent's summary block from the rest of the reply", async () => {
  const { splitSummary } = await import("./AssistantOutput");
  const body = "Intro\n```leo:summary\nMain point.\nExtra.\n```\nDetails here";
  expect(splitSummary(body)).toEqual({
    summary: "Main point.\nExtra.",
    rest: "Intro\nDetails here",
  });
  expect(splitSummary("No block here")).toEqual({ summary: null, rest: "No block here" });
  expect(splitSummary("```leo:summary\n\n```\nText").summary).toBeNull();
});

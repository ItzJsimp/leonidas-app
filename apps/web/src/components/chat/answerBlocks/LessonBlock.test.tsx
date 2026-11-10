import { act } from "react";
import { create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";

import { AnswerBlockActionsContext } from "./AnswerBlockActions";
import { AnswerBlockView } from "./AnswerBlockView";

const LESSON = JSON.stringify({
  title: "Prop trading from zero",
  meta: "8 modules",
  tabs: [
    {
      label: "Modules",
      cards: [
        { title: "Firm rules", body: "Daily loss limit.", done: true },
        { title: "Position size", body: "Size from the stop.", done: false, actions: ["Quiz me"] },
      ],
    },
    { label: "Words", cards: [{ title: "Drawdown", body: "The most you can lose.", kind: "key" }] },
  ],
});

function render(fillComposer = vi.fn()): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <AnswerBlockActionsContext.Provider value={{ fillComposer }}>
        <AnswerBlockView type="lesson" code={LESSON} closed fallback={<pre>raw</pre>} />
      </AnswerBlockActionsContext.Provider>,
    );
  });
  return renderer;
}

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const textOf = (node: ReactTestInstance | string): string =>
  typeof node === "string" ? node : node.children.map(textOf).join("");
const button = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.findAllByType("button").find((b) => textOf(b).includes(label))!;

describe("lesson block", () => {
  it("shows the first tab, its progress, and switches tabs", () => {
    const renderer = render();
    expect(text(renderer)).toContain("Prop trading from zero");
    expect(text(renderer)).toContain("Position size");
    expect(text(renderer)).toContain("1 of 2 done");
    expect(text(renderer)).not.toContain("Drawdown");
    act(() => button(renderer, "Words").props.onClick());
    expect(text(renderer)).toContain("Drawdown");
    expect(renderer.root.findAllByProps({ "data-kind": "key" })).toHaveLength(1);
  });

  it("fills the composer from Ask and card actions, and never sends", () => {
    const fillComposer = vi.fn();
    const renderer = render(fillComposer);
    act(() => button(renderer, "Quiz me").props.onClick());
    expect(fillComposer).toHaveBeenLastCalledWith('Quiz me: "Position size"');
    act(() =>
      renderer.root.findAllByProps({ "aria-label": "Ask about Firm rules" })[0]!.props.onClick(),
    );
    expect(fillComposer).toHaveBeenLastCalledWith('Tell me more about "Firm rules".');
  });

  it("marks a card done and updates the progress", () => {
    const renderer = render();
    act(() => button(renderer, "Mark done").props.onClick());
    expect(text(renderer)).toContain("2 of 2 done");
  });
});

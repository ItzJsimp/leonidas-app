import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vite-plus/test";

import { remarkThoughtPreview } from "./remarkThoughtPreview";

function preview(source: string, math: boolean): Root {
  const processor = unified().use(remarkParse).use(remarkGfm);
  if (math) processor.use(remarkMath, { singleDollarTextMath: true });
  processor.use(remarkThoughtPreview, "Thought");
  return processor.runSync(processor.parse(source)) as Root;
}

describe("remarkThoughtPreview", () => {
  it("flattens Markdown into one line of label text", () => {
    const tree = preview("# Plan\n\n- **first** step\n- second `step`", false);
    expect(tree.children).toEqual([{ type: "text", value: "Plan first step second step" }]);
  });

  it("falls back when nothing is left to show", () => {
    expect(preview("<br>", false).children).toEqual([{ type: "text", value: "Thought" }]);
  });

  it("keeps formulas as math code nodes between text", () => {
    const tree = preview("Solve $x^2 = 4$ now", true);
    expect(tree.children.map((child) => child.type)).toEqual(["text", "inlineMath", "text"]);
    const formula = tree.children[1];
    expect(formula?.data).toMatchObject({
      hName: "code",
      hProperties: { className: ["language-math", "math-inline"] },
    });
    expect(tree.children[0]).toMatchObject({ value: "Solve " });
    expect(tree.children[2]).toMatchObject({ value: " now" });
  });

  it("turns a display formula into an inline one", () => {
    const tree = preview("$$\ny = mx + b\n$$", true);
    expect(tree.children.map((child) => child.type)).toEqual(["inlineMath"]);
  });
});

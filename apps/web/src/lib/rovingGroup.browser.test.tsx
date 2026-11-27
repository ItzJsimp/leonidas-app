import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../test/render";
import { rovingGroup } from "./rovingGroup";

function Group({ role, item }: { role: "radiogroup" | "tablist" | "toolbar"; item?: string }) {
  const [picked, setPicked] = useState("b");
  return (
    <div role={role} aria-label="Group" ref={rovingGroup}>
      {["a", "b", "off", "c"].map((id) => (
        <button
          key={id}
          type="button"
          role={item}
          disabled={id === "off"}
          aria-checked={item === "radio" ? picked === id : undefined}
          aria-selected={item === "tab" ? picked === id : undefined}
          onClick={() => setPicked(id)}
        >
          {id}
        </button>
      ))}
    </div>
  );
}

const focused = () => document.activeElement?.textContent;
const tabStops = (root: HTMLElement) =>
  [...root.querySelectorAll("button:enabled")]
    .filter((el) => el.getAttribute("tabindex") === "0")
    .map((el) => el.textContent);
const picked = (root: HTMLElement) =>
  root.querySelector('[aria-checked="true"], [aria-selected="true"]')?.textContent;

describe("rovingGroup", () => {
  it("gives a radio group one tab stop and picks with every arrow, Home and End", async () => {
    await using screen = await render(<Group role="radiogroup" item="radio" />);
    const root = screen.container;
    await expect.poll(() => tabStops(root)).toEqual(["b"]);
    (root.querySelectorAll("button")[1] as HTMLElement).focus();

    for (const [key, expected] of [
      ["{ArrowRight}", "c"],
      ["{ArrowDown}", "a"],
      ["{ArrowLeft}", "c"],
      ["{ArrowUp}", "b"],
      ["{End}", "c"],
      ["{Home}", "a"],
    ] as const) {
      await userEvent.keyboard(key);
      expect(focused()).toBe(expected);
      await expect.poll(() => picked(root)).toBe(expected);
      await expect.poll(() => tabStops(root)).toEqual([expected]);
    }
  });

  it("moves tabs left and right only", async () => {
    await using screen = await render(<Group role="tablist" item="tab" />);
    (screen.container.querySelectorAll("button")[1] as HTMLElement).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(focused()).toBe("b");
    await userEvent.keyboard("{ArrowRight}");
    expect(focused()).toBe("c");
    await expect.poll(() => picked(screen.container)).toBe("c");
  });

  it("moves focus in a toolbar without pressing a button", async () => {
    await using screen = await render(<Group role="toolbar" />);
    const root = screen.container;
    await expect.poll(() => tabStops(root)).toEqual(["a"]);
    (root.querySelector("button") as HTMLElement).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(focused()).toBe("b");
    await expect.poll(() => tabStops(root)).toEqual(["b"]);
  });
});

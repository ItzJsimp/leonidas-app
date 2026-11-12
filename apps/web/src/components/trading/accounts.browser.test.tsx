import { describe, expect, it } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { AccountsView } from "./AccountsView";
import { FIFTEEN, stateOf } from "./accounts.fixture";

const options = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[role="option"]'),
];

const selectedIndex = (container: HTMLElement) =>
  options(container).findIndex((option) => option.getAttribute("aria-selected") === "true");

const chip = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('[role="group"] button')].find(
    (button) => button.textContent === label,
  )!;

const typeSearch = async (container: HTMLElement, value: string) => {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const pressKey = async (container: HTMLElement, key: string) => {
  const list = container.querySelector<HTMLElement>('[role="listbox"]')!;
  await act(async () => {
    list.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
};

describe("Accounts tab with 15 accounts", () => {
  it("filter chips and search narrow the list, and arrow keys move the selection", async () => {
    await using screen = await render(<AccountsView state={stateOf(FIFTEEN)} />);
    const { container } = screen;
    expect(options(container)).toHaveLength(12);

    await act(async () => chip(container, "Funded").click());
    expect(options(container)).toHaveLength(4);
    await act(async () => chip(container, "Closed history").click());
    expect(options(container)).toHaveLength(3);
    await act(async () => chip(container, "All").click());

    await typeSearch(container, "1007");
    expect(options(container)).toHaveLength(1);
    await typeSearch(container, "");
    expect(options(container)).toHaveLength(12);

    expect(container.querySelector('[aria-label="Attempts"]')).toBeNull();
    await pressKey(container, "ArrowDown");
    expect(selectedIndex(container)).toBe(0);
    await pressKey(container, "ArrowDown");
    expect(selectedIndex(container)).toBe(1);
    expect(document.activeElement).toBe(options(container)[1]);
    expect(container.querySelector('[aria-label="Attempts"]')).not.toBeNull();
    await pressKey(container, "ArrowUp");
    expect(selectedIndex(container)).toBe(0);
    await pressKey(container, "End");
    expect(selectedIndex(container)).toBe(11);
    await pressKey(container, "ArrowDown");
    expect(selectedIndex(container)).toBe(11);
  });
});

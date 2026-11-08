// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { SuggestionExample } from "./SuggestionExample";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("shows the heard and written lines and marks only the changed words", async () => {
  await act(async () =>
    root.render(
      <SuggestionExample
        example={{
          heard: { before: "I talked to ", changed: "jersey", after: " today" },
          wrote: { before: "I talked to ", changed: "Gersi", after: " today" },
        }}
      />,
    ),
  );
  expect([...container.querySelectorAll("dd")].map((line) => line.textContent)).toEqual([
    "I talked to jersey today",
    "I talked to Gersi today",
  ]);
  expect([...container.querySelectorAll("dt")].map((label) => label.textContent)).toEqual([
    "Heard",
    "Wrote",
  ]);
  expect([...container.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual([
    "jersey",
    "Gersi",
  ]);
});

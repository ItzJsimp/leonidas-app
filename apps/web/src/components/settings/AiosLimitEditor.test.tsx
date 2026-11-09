// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

import { AiosLimitEditor } from "./AiosLimitEditor";

const run = vi.hoisted(() => vi.fn());
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => true }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => run }));
vi.mock("~/state/taskBoard", () => ({
  aiosLimitSet: { permissionAtom: () => ({}) },
  taskBoardCapSet: {},
}));
vi.mock("~/components/workspace/aiosWorkspaceStore", () => ({ activeWorkspaceId: () => "ws-1" }));
vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  isAtomCommandInterrupted: () => false,
  squashAtomCommandFailure: (result: unknown) => result,
}));

it("saves a limit on blur and resets it to the default", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  run.mockReset().mockResolvedValue({ _tag: "Success" });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const refresh = vi.fn();
  await act(async () =>
    root.render(
      <AiosLimitEditor
        environmentId={"env-1" as never}
        limit={{
          id: "batch_threshold_files",
          label: "Batch",
          value: 5,
          default: 3,
          unit: "files",
          min: 1,
          max: 10,
        }}
        onSaved={refresh}
      />,
    ),
  );
  const field = container.querySelector<HTMLInputElement>('input[aria-label="Batch"]')!;
  await act(async () => {
    field.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "7");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(run).not.toHaveBeenCalled();
  await act(async () => field.blur());
  expect(run).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({ id: "batch_threshold_files", value: 7 }),
    }),
  );
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Reset to default"))!
      .click(),
  );
  expect(run).toHaveBeenLastCalledWith(
    expect.objectContaining({ input: expect.objectContaining({ value: 3 }) }),
  );
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("refuses a value outside the allowed range without saving", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  run.mockReset();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <AiosLimitEditor
        environmentId={"env-1" as never}
        limit={{
          id: "batch_threshold_files",
          label: "Batch",
          value: 5,
          default: 3,
          unit: "files",
          min: 1,
          max: 10,
        }}
        onSaved={() => {}}
      />,
    ),
  );
  const field = container.querySelector<HTMLInputElement>('input[aria-label="Batch"]')!;
  await act(async () => {
    field.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "99");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => field.blur());
  expect(run).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("1 to 10");
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

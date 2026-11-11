// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { VoiceLimitEditor } from "./VoiceLimitEditor";

const run = vi.hoisted(() => vi.fn());
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => true }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => run }));
vi.mock("~/state/taskBoard", () => ({ voiceLimitSet: { permissionAtom: () => ({}) } }));
vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  isAtomCommandInterrupted: () => false,
  squashAtomCommandFailure: (result: unknown) => result,
}));

it("shows fractional seconds and saves zero", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  run.mockReset().mockResolvedValue({ _tag: "Success" });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <VoiceLimitEditor environmentId={"env-1" as never} seconds={1.5} onSaved={() => {}} />,
    ),
  );
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Voice throttle"]')!;
  expect(input.value).toBe("1.5");
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "0");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => input.blur());
  expect(run).toHaveBeenCalledWith(expect.objectContaining({ input: { seconds: 0 } }));
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

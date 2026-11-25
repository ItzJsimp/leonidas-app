import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderInstallState,
} from "@t3tools/contracts";
import { page } from "vite-plus/test/browser";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";

const state = vi.hoisted(() => ({
  installation: null as ProviderInstallState | null,
  start: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("../../state/server", () => ({
  serverEnvironment: {
    providerInstallState: () => "install",
    startProviderInstall: state.start,
    cancelProviderInstall: state.cancel,
  },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: () => ({ data: state.installation, error: null }),
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: (command: unknown) => command }));

import { ClaudeRuntimeRepair } from "./ClaudeRuntimeRepair";

const environmentId = EnvironmentId.make("repair-test");
const instanceId = ProviderInstanceId.make("claudeAgent");
const view = (readOnly = false) => (
  <ClaudeRuntimeRepair environmentId={environmentId} instanceId={instanceId} readOnly={readOnly} />
);

function reset() {
  state.start.mockReset().mockResolvedValue({ _tag: "Success" });
  state.cancel.mockReset().mockResolvedValue({ _tag: "Success" });
  state.installation = {
    driver: ProviderDriverKind.make("claudeAgent"),
    operationId: "repair-1",
    phase: "failed",
    downloadedBytes: 10_000_000,
    totalBytes: 100_000_000,
    version: null,
    installedVersion: null,
    executablePath: null,
    source: null,
    canRemove: false,
    message: "The connection stopped. The partial download is saved.",
  };
}

it("keeps an automatic failure visible and retries with one click", async () => {
  reset();
  await using _screen = await render(view());
  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent("The connection stopped. The partial download is saved.");
  await page.getByRole("button", { name: "Repair Claude", exact: true }).click();
  expect(state.start).toHaveBeenCalledExactlyOnceWith({ environmentId, input: { instanceId } });
  expect(state.cancel).not.toHaveBeenCalled();
});

it("shows shared progress and cancels the active operation", async () => {
  reset();
  state.installation = { ...state.installation!, phase: "downloading" };
  await using _screen = await render(view());
  await expect
    .element(page.getByRole("status"))
    .toHaveTextContent("Repairing Claude. 10.0 of 100.0 MB.");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(state.cancel).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { instanceId, operationId: "repair-1" },
  });
  expect(state.start).not.toHaveBeenCalled();
});

it("shows the cause without repair controls for a read-only connection", async () => {
  reset();
  await using _screen = await render(view(true));
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Repair Claude", exact: true }))
    .not.toBeInTheDocument();
});

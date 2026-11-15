// @effect-diagnostics nodeBuiltinImport:off - proves a real folder survives a project removal.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  allowed: true,
  confirmed: true,
  confirm: vi.fn(),
  deleteProject: vi.fn(),
  toastAdd: vi.fn(),
  draftStore: {
    getDraftThreadByProjectRef: vi.fn(() => null),
    clearDraftThread: vi.fn(),
    clearProjectDraftThreadId: vi.fn(),
  },
}));

vi.mock("react", () => ({
  useCallback: (fn: unknown) => fn,
  useRef: (current: unknown) => ({ current }),
  useEffect: (fn: () => void) => fn(),
}));
vi.mock("@t3tools/contracts", () => ({ AuthOrchestrationOperateScope: "operate" }));
vi.mock("@t3tools/client-runtime/environment", () => ({
  scopeProjectRef: (environmentId: string, projectId: string) => ({ environmentId, projectId }),
  scopeThreadRef: (environmentId: string, threadId: string) => ({ environmentId, threadId }),
}));
vi.mock("@t3tools/client-runtime/errors", () => ({ safeErrorLogAttributes: () => ({}) }));
vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  isAtomCommandInterrupted: () => false,
  squashAtomCommandFailure: (result: { error: unknown }) => result.error,
}));
vi.mock("../../composerDraftStore", () => ({
  useComposerDraftStore: { getState: () => state.draftStore },
}));
vi.mock("../../lib/composerDraftUploads", () => ({ releaseProjectDraftUploads: vi.fn() }));
vi.mock("../../localApi", () => ({
  readLocalApi: () => ({ dialogs: { confirm: state.confirm } }),
}));
vi.mock("../../state/projects", () => ({ projectEnvironment: { delete: {} } }));
vi.mock("../../state/session", () => ({ readEnvironmentScope: () => state.allowed }));
vi.mock("../../state/use-orchestration-command", () => ({
  ORCHESTRATION_OPERATE_DENIED_MESSAGE: "denied",
  useOrchestrationCommand: () => state.deleteProject,
}));
vi.mock("../ui/toast", () => ({
  stackedThreadToast: (toast: unknown) => toast,
  toastManager: { add: state.toastAdd },
}));

import { removeProjectConfirmMessage, useRemoveProject } from "./useRemoveProject";

let folder: string;
const asId = <T>(value: string) => value as unknown as T;

beforeEach(() => {
  folder = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "remove-project-"));
  NodeFS.writeFileSync(NodePath.join(folder, "keep.txt"), "mine");
  state.allowed = true;
  state.confirm.mockReset().mockResolvedValue(true);
  state.deleteProject.mockReset().mockResolvedValue({ _tag: "Success" });
  state.toastAdd.mockClear();
  state.draftStore.clearProjectDraftThreadId.mockClear();
});

afterEach(() => NodeFS.rmSync(folder, { recursive: true, force: true }));

const project = () => ({
  environmentId: asId<never>("env"),
  id: asId<never>("p1"),
  title: "Old",
  workspaceRoot: folder,
});

it("deletes only the project entry at once when it has no chats, and leaves the folder", async () => {
  const remove = useRemoveProject([]);
  await remove(project());

  expect(state.confirm).not.toHaveBeenCalled();
  expect(state.deleteProject).toHaveBeenCalledExactlyOnceWith({
    environmentId: "env",
    input: { projectId: "p1", force: true },
  });
  expect(NodeFS.existsSync(NodePath.join(folder, "keep.txt"))).toBe(true);
  expect(state.draftStore.clearProjectDraftThreadId).toHaveBeenCalled();
});

it("confirm text says files stay on disk and names the chats it deletes", async () => {
  const thread = {
    environmentId: asId<never>("env"),
    id: asId<never>("t1"),
    projectId: asId<never>("p1"),
  };
  const other = { ...thread, id: asId<never>("t2"), projectId: asId<never>("p2") };
  await useRemoveProject([thread, other])(project(), "Laptop");

  const message = state.confirm.mock.calls[0]![0] as string;
  expect(message).toContain("Your files stay on disk.");
  expect(message).toContain("delete its 1 thread?");
  expect(message).toContain("Computer: Laptop");
  expect(removeProjectConfirmMessage({ project: project(), threadCount: 2 })).toContain(
    "delete its 2 threads?",
  );
});

it("removes nothing when the user cancels or lacks permission", async () => {
  const thread = {
    environmentId: asId<never>("env"),
    id: asId<never>("t1"),
    projectId: asId<never>("p1"),
  };
  state.confirm.mockResolvedValue(false);
  await useRemoveProject([thread])(project());
  expect(state.deleteProject).not.toHaveBeenCalled();

  state.allowed = false;
  await useRemoveProject([thread])(project());
  expect(state.confirm).toHaveBeenCalledTimes(1);
  expect(state.toastAdd).toHaveBeenCalledTimes(1);
});

it("shows an error and keeps drafts when the delete fails", async () => {
  state.deleteProject.mockResolvedValue({ _tag: "Failure", error: new Error("boom") });
  vi.spyOn(console, "error").mockImplementation(() => {});
  await useRemoveProject([])(project());

  expect(state.toastAdd).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Could not remove "Old"', description: "boom" }),
  );
  expect(state.draftStore.clearProjectDraftThreadId).not.toHaveBeenCalled();
});

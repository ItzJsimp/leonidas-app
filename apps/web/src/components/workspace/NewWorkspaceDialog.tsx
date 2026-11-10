import { getNewProjectPublishTargets } from "@t3tools/client-runtime/operations/projects";
import { inferProjectTitleFromPath } from "@t3tools/client-runtime/state/projects";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { ensureLocalApi } from "~/localApi";
import { newProjectId } from "~/lib/utils";
import { aiosWorkspaceInit } from "~/state/aiosWorkspaces";
import { useEnvironments } from "~/state/environments";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { useAtomCommand } from "~/state/use-atom-command";

import {
  childFolder,
  homeRepository,
  newWorkspaceFolder,
  uniqueWorkspaceId,
} from "./aiosWorkspace.logic";
import { useNewWorkspaceStore } from "./newWorkspaceStore";
import { useActiveAiosWorkspace } from "./useActiveAiosWorkspace";
import { WORKSPACE_PRESETS, type WorkspacePreset } from "./workspacePresets";

// The system folder picker exists only in the desktop app.
const pickFolder = window.desktopBridge ? () => ensureLocalApi().dialogs.pickFolder() : undefined;

const CARD =
  "flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/**
 * New workspace in 2 steps: pick a kind, then name it. Each kind makes its folder, adds it as a
 * project and writes workspace.json; a business also copies the template with you as Owner.
 */
export function NewWorkspaceDialog() {
  const open = useNewWorkspaceStore((store) => store.open);
  const { environmentId, workspaces, active, refresh, choose } = useActiveAiosWorkspace();
  const { environments } = useEnvironments();
  const navigate = useNavigate();
  const landing = useRef<{ readonly id: string; readonly to: WorkspacePreset["landing"] } | null>(
    null,
  );
  const newProjectsRoot =
    environments.find((environment) => environment.environmentId === environmentId)?.serverConfig
      ?.newProjectsRoot ?? null;
  const close = () => useNewWorkspaceStore.setState({ open: false });

  // The landing page reads the active workspace, so it opens once the new one is active.
  const activeId = active?.id;
  useEffect(() => {
    const target = landing.current;
    if (target === null || activeId !== target.id) return;
    landing.current = null;
    void navigate({ to: target.to });
  }, [activeId, navigate]);

  if (!open || environmentId === null || newProjectsRoot === null) return null;
  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : close())}>
      <DialogPopup>
        <NewWorkspaceSteps
          environmentId={environmentId}
          newProjectsRoot={newProjectsRoot}
          takenIds={workspaces.flatMap((workspace) => (workspace.id ? [workspace.id] : []))}
          onDone={(done) => {
            close();
            if (done === null) return;
            refresh();
            choose(done.id);
            landing.current = { id: done.id, to: done.landing };
          }}
        />
      </DialogPopup>
    </Dialog>
  );
}

type Done = { readonly id: string; readonly landing: WorkspacePreset["landing"] } | null;

function NewWorkspaceSteps(props: {
  readonly environmentId: NonNullable<ReturnType<typeof useActiveAiosWorkspace>["environmentId"]>;
  readonly newProjectsRoot: string;
  readonly takenIds: ReadonlyArray<string>;
  readonly onDone: (done: Done) => void;
}) {
  const [preset, setPreset] = useState<WorkspacePreset | null>(null);
  if (preset) {
    return <NewWorkspaceForm {...props} preset={preset} onBack={() => setPreset(null)} />;
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>New workspace</DialogTitle>
      </DialogHeader>
      <DialogPanel>
        <ul className="flex flex-col gap-2" aria-label="Kind of workspace">
          {WORKSPACE_PRESETS.map((option) => (
            <li key={option.type}>
              <button type="button" className={CARD} onClick={() => setPreset(option)}>
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent">
                  <option.icon aria-hidden className="size-4.5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold">{option.name}</span>
                  <span className="text-xs text-muted-foreground">{option.line}</span>
                </span>
                <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => props.onDone(null)}>
          Cancel
        </Button>
      </DialogFooter>
    </>
  );
}

function NewWorkspaceForm(props: {
  readonly environmentId: NonNullable<ReturnType<typeof useActiveAiosWorkspace>["environmentId"]>;
  readonly newProjectsRoot: string;
  readonly takenIds: ReadonlyArray<string>;
  readonly preset: WorkspacePreset;
  readonly onBack: () => void;
  readonly onDone: (done: Done) => void;
}) {
  const { preset } = props;
  const isBusiness = preset.type === "business";
  const id = useId();
  const [name, setName] = useState(preset.defaultName);
  const [ownerName, setOwnerName] = useState("");
  // The picked folder: the workspace itself, or the place to make it in (preset.folderPick).
  // Null makes the workspace folder beside the managed projects folder.
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A retry after a failed setup reuses the folder, so it is never added twice.
  const [createdRoot, setCreatedRoot] = useState<string | null>(null);
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const runInit = useAtomCommand(aiosWorkspaceInit, { reportFailure: false });
  const publishRepository = useAtomCommand(sourceControlEnvironment.publishRepository, {
    reportFailure: false,
  });
  const discovery = useEnvironmentQuery(
    isBusiness
      ? sourceControlEnvironment.discovery({ environmentId: props.environmentId, input: {} })
      : null,
  );
  // Home is a GitHub repo: invites and the area sync match people by GitHub login.
  const github = getNewProjectPublishTargets(discovery.data ?? null).find(
    (target) => target.definition.kind === "github",
  );
  const [publishes, setPublishes] = useState(false);
  const workspaceId = uniqueWorkspaceId(name, props.takenIds);
  const canPick = preset.folderPick !== null && pickFolder !== undefined;
  const usesExisting = picked !== null && preset.folderPick === "existing";
  const folder =
    createdRoot ??
    (picked === null
      ? newWorkspaceFolder(props.newProjectsRoot, preset.folderParent, workspaceId)
      : usesExisting
        ? picked
        : childFolder(picked, workspaceId));

  const pick = async () => {
    const path = await pickFolder?.().catch(() => null);
    if (!path) return;
    setPicked(path);
    setError(null);
    if (preset.folderPick === "existing" && name === preset.defaultName) {
      setName(inferProjectTitleFromPath(path));
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    if (createdRoot === null) {
      const created = await createProject({
        environmentId: props.environmentId,
        input: {
          projectId: newProjectId(),
          title: inferProjectTitleFromPath(folder),
          workspaceRoot: folder,
          createWorkspaceRootIfMissing: !usesExisting,
          defaultModelSelection: null,
        },
      });
      // A picked existing folder may already be a project; the setup below still finds it.
      if (created._tag !== "Success" && !usesExisting) {
        setBusy(false);
        setError(
          canPick
            ? "Could not make the folder. Pick another name or another folder."
            : "Could not make the folder. Check that this name is not already in use.",
        );
        return;
      }
      setCreatedRoot(folder);
    }
    const result = await runInit({
      environmentId: props.environmentId,
      input: {
        root: folder,
        id: workspaceId,
        name: name.trim(),
        type: preset.type,
        ...(isBusiness ? { ownerName: ownerName.trim() } : {}),
      },
    });
    if (result._tag === "Success" && publishes && github) {
      const published = await publishRepository({
        environmentId: props.environmentId,
        input: {
          cwd: folder,
          provider: github.definition.kind,
          repository: homeRepository(github.owner, workspaceId),
          visibility: "private",
        },
      });
      toastManager.add(
        stackedThreadToast(
          published._tag === "Success"
            ? {
                type: "success",
                title: "Home published to GitHub",
                description: published.value.repository.nameWithOwner,
              }
            : {
                type: "error",
                title: "Could not publish Home to GitHub",
                description: "Use Publish Repository in the Git menu to try again.",
              },
        ),
      );
    }
    setBusy(false);
    if (result._tag === "Success") props.onDone({ id: workspaceId, landing: preset.landing });
    else {
      setError(
        isBusiness
          ? "Could not set up the business. GitHub must be signed in on this computer (gh auth login), and the folder must be writable."
          : "Could not set up the workspace. The folder must be writable and must not have a workspace file yet.",
      );
    }
  };

  return (
    <form className="contents" onSubmit={onSubmit}>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Back to kinds of workspace"
            disabled={busy || createdRoot !== null}
            onClick={props.onBack}
          >
            <ArrowLeftIcon aria-hidden />
          </Button>
          <DialogTitle>New {preset.name.toLowerCase()} workspace</DialogTitle>
        </div>
      </DialogHeader>
      <DialogPanel>
        <div className="flex flex-col gap-4">
          <Label className="flex flex-col items-stretch" htmlFor={`${id}-name`}>
            {isBusiness ? "Business name" : "Name"}
            <Input
              id={`${id}-name`}
              autoFocus
              value={name}
              maxLength={80}
              disabled={createdRoot !== null}
              onChange={(event) => setName(event.target.value)}
            />
          </Label>
          {isBusiness ? (
            <Label className="flex flex-col items-stretch" htmlFor={`${id}-owner`}>
              Your name (the Owner)
              <Input
                id={`${id}-owner`}
                value={ownerName}
                maxLength={80}
                onChange={(event) => setOwnerName(event.target.value)}
              />
            </Label>
          ) : null}
          {isBusiness && github ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={publishes}
                onCheckedChange={(value) => setPublishes(value === true)}
              />
              <span>
                Publish Home to GitHub as a private repository:{" "}
                <code>{homeRepository(github.owner, workspaceId)}</code>
              </span>
            </label>
          ) : null}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <code className="min-w-0 break-all text-xs text-muted-foreground">{folder}</code>
            {canPick && createdRoot === null ? (
              <Button
                type="button"
                variant="link"
                size="xs"
                onClick={() => (usesExisting ? setPicked(null) : void pick())}
              >
                {preset.folderPick === "parent"
                  ? "Change folder"
                  : usesExisting
                    ? "Use a new folder"
                    : "Use an existing folder"}
              </Button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => props.onDone(null)}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !name.trim() || (isBusiness && !ownerName.trim())}>
          {busy ? <Spinner /> : null}
          Create workspace
        </Button>
      </DialogFooter>
    </form>
  );
}

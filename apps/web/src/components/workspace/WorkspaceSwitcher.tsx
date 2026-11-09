import type { AiosWorkspaceSummary, AiosWorkspaceType } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { CheckIcon, FolderCogIcon, ImageUpIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { needsYouLine } from "~/components/twoState/railItems";
import { Tip } from "~/components/twoState/Tip";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import { aiosWorkspaceInit } from "~/state/aiosWorkspaces";
import { useAtomCommand } from "~/state/use-atom-command";

import { suggestWorkspaceId, workspaceFolderName } from "./aiosWorkspace.logic";
import { openNewBusiness } from "./newBusinessStore";
import { useActiveAiosWorkspace } from "./useActiveAiosWorkspace";
import { useWorkspacePictureUpload } from "./WorkspacePictureEditor";
import { useWorkspacePictures, WorkspacePicture, WorkspaceTypeChip } from "./WorkspacePicture";

const ROW =
  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/**
 * The rail's workspace menu: each workspace with its picture, name and type, then Add a workspace
 * and Workspace settings. Hover a picture to change it. A folder with no valid workspace.json
 * shows a Set up row.
 */
export function WorkspaceMenu(props: {
  /** What needs you in the open workspace. The feed counts only the open one. */
  readonly needsYou: number | null;
  readonly onDone: () => void;
}) {
  const { environmentId, workspaces, active, choose, refresh } = useActiveAiosWorkspace();
  const { pictures } = useWorkspacePictures();
  const upload = useWorkspacePictureUpload();
  const [setupRoot, setSetupRoot] = useState<string | null>(null);
  const ready = workspaces.filter((workspace) => workspace.status === "ready");
  const needsSetup = workspaces.filter((workspace) => workspace.status !== "ready");
  const setupTarget = needsSetup.find((workspace) => workspace.root === setupRoot) ?? null;

  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">Workspaces</p>
      {ready.map((workspace) => {
        const id = workspace.id!;
        const name = workspace.name ?? id;
        const current = id === active?.id;
        return (
          <div key={id} className="flex items-center gap-1">
            <div className="group/picture relative shrink-0">
              <WorkspacePicture
                workspaceId={id}
                name={name}
                pictures={pictures}
                className="size-8 rounded-lg border border-border text-xs"
              />
              <Tip text="Change picture">
                <button
                  type="button"
                  aria-label={`Change picture for ${name}`}
                  disabled={upload.busy !== null}
                  onClick={() => upload.pick(id)}
                  className="absolute inset-0 inline-flex items-center justify-center rounded-lg bg-background/80 text-foreground opacity-0 transition-opacity group-hover/picture:opacity-100 focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
                >
                  {upload.busy === id ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <ImageUpIcon aria-hidden className="size-4" />
                  )}
                </button>
              </Tip>
            </div>
            <button
              type="button"
              aria-current={current ? "true" : undefined}
              className={cn(ROW, current && "bg-accent/60")}
              onClick={() => {
                if (!current) choose(id);
                props.onDone();
              }}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{name}</span>
                {current && props.needsYou !== null ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {props.needsYou > 0 ? (
                      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning" />
                    ) : null}
                    {needsYouLine(props.needsYou)}
                  </span>
                ) : null}
              </span>
              <WorkspaceTypeChip type={workspace.type ?? "personal"} />
              <CheckIcon
                aria-hidden
                className={cn("size-4 shrink-0", current ? "text-foreground" : "invisible")}
              />
            </button>
          </div>
        );
      })}
      {needsSetup.map((workspace) => (
        <button
          key={workspace.root}
          type="button"
          className={cn(ROW, "text-muted-foreground")}
          onClick={() => setSetupRoot(workspace.root)}
        >
          <FolderCogIcon aria-hidden className="size-4 shrink-0" />
          <span className="truncate">Set up {workspaceFolderName(workspace.root)}</span>
        </button>
      ))}
      {upload.error ? (
        <p role="alert" className="px-2 text-xs text-destructive">
          {upload.error}
        </p>
      ) : null}
      {upload.input}
      <span aria-hidden className="my-1 h-px bg-border" />
      <button
        type="button"
        className={ROW}
        onClick={() => {
          props.onDone();
          openNewBusiness();
        }}
      >
        <PlusIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        Add a workspace
      </button>
      <Link to="/settings/general" className={ROW} onClick={props.onDone}>
        <SettingsIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        Workspace settings
      </Link>
      <Dialog
        open={setupTarget !== null}
        onOpenChange={(open) => {
          if (!open) setSetupRoot(null);
        }}
      >
        <DialogPopup>
          {setupTarget && environmentId ? (
            <WorkspaceSetupForm
              environmentId={environmentId}
              workspace={setupTarget}
              onDone={(workspaceId) => {
                setSetupRoot(null);
                refresh();
                if (workspaceId) choose(workspaceId);
              }}
            />
          ) : null}
        </DialogPopup>
      </Dialog>
    </div>
  );
}

function WorkspaceSetupForm(props: {
  readonly environmentId: NonNullable<ReturnType<typeof useActiveAiosWorkspace>["environmentId"]>;
  readonly workspace: AiosWorkspaceSummary;
  readonly onDone: (workspaceId: string | null) => void;
}) {
  const id = useId();
  const folder = workspaceFolderName(props.workspace.root);
  const [name, setName] = useState(folder.replace(/\s+AIOS$/i, ""));
  const [type, setType] = useState<AiosWorkspaceType>("personal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runInit = useAtomCommand(aiosWorkspaceInit, { reportFailure: false });
  const workspaceId = suggestWorkspaceId(name);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await runInit({
      environmentId: props.environmentId,
      input: { root: props.workspace.root, id: workspaceId, name: name.trim(), type },
    });
    setBusy(false);
    if (result._tag === "Success") props.onDone(workspaceId);
    else setError("Could not save the workspace file. Check that the folder is writable.");
  };

  return (
    <form className="contents" onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>Set up {folder}</DialogTitle>
        <DialogDescription>
          {props.workspace.status === "invalid"
            ? `The workspace file in this folder is not valid (${props.workspace.error ?? "unknown error"}). Save a new one to open it.`
            : "This folder has no workspace file yet. Save one to open it as its own workspace."}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex flex-col gap-4">
          <Label className="flex flex-col items-stretch" htmlFor={`${id}-name`}>
            Name
            <Input
              id={`${id}-name`}
              autoFocus
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </Label>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Type</legend>
            {(["personal", "business"] as const).map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${id}-type`}
                  checked={type === option}
                  onChange={() => setType(option)}
                />
                {option === "personal" ? "Personal" : "Business"}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-muted-foreground">
            Saves workspace.json with the id <code>{workspaceId}</code> in {props.workspace.root}.
          </p>
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
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? <Spinner /> : null}
          Save workspace
        </Button>
      </DialogFooter>
    </form>
  );
}

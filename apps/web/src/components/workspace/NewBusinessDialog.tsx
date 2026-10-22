import { inferProjectTitleFromPath } from "@t3tools/client-runtime/state/projects";
import { useId, useState, type FormEvent } from "react";

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
import { newProjectId } from "~/lib/utils";
import { aiosWorkspaceInit } from "~/state/aiosWorkspaces";
import { useEnvironments } from "~/state/environments";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";

import { newBusinessFolder, suggestWorkspaceId } from "./aiosWorkspace.logic";
import { useNewBusinessStore } from "./newBusinessStore";
import { useActiveAiosWorkspace } from "./useActiveAiosWorkspace";

/**
 * Starts a new business workspace from a name: makes the folder, adds it as a project, and sets
 * it up as a business with the person at this keyboard as Owner (the template is copied by the
 * server).
 */
export function NewBusinessDialog() {
  const open = useNewBusinessStore((store) => store.open);
  const { environmentId, refresh, choose } = useActiveAiosWorkspace();
  const { environments } = useEnvironments();
  const newProjectsRoot =
    environments.find((environment) => environment.environmentId === environmentId)?.serverConfig
      ?.newProjectsRoot ?? null;
  const close = () => useNewBusinessStore.setState({ open: false });
  if (!open || environmentId === null || newProjectsRoot === null) return null;
  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : close())}>
      <DialogPopup>
        <NewBusinessForm
          environmentId={environmentId}
          newProjectsRoot={newProjectsRoot}
          onDone={(workspaceId) => {
            close();
            refresh();
            if (workspaceId) choose(workspaceId);
          }}
        />
      </DialogPopup>
    </Dialog>
  );
}

function NewBusinessForm(props: {
  readonly environmentId: NonNullable<ReturnType<typeof useActiveAiosWorkspace>["environmentId"]>;
  readonly newProjectsRoot: string;
  readonly onDone: (workspaceId: string | null) => void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A retry after a failed setup reuses the folder, so it is never added twice.
  const [createdRoot, setCreatedRoot] = useState<string | null>(null);
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const runInit = useAtomCommand(aiosWorkspaceInit, { reportFailure: false });
  const workspaceId = suggestWorkspaceId(name);
  const folder = newBusinessFolder(props.newProjectsRoot, name);

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
          createWorkspaceRootIfMissing: true,
          defaultModelSelection: null,
        },
      });
      if (created._tag !== "Success") {
        setBusy(false);
        setError("Could not make the folder. Check that this name is not already in use.");
        return;
      }
      setCreatedRoot(folder);
    }
    const result = await runInit({
      environmentId: props.environmentId,
      input: {
        root: createdRoot ?? folder,
        id: workspaceId,
        name: name.trim(),
        type: "business",
        ownerName: ownerName.trim(),
      },
    });
    setBusy(false);
    if (result._tag === "Success") props.onDone(workspaceId);
    else {
      setError(
        "Could not set up the business. GitHub must be signed in on this computer (gh auth login), and the folder must be writable.",
      );
    }
  };

  return (
    <form className="contents" onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>New business</DialogTitle>
        <DialogDescription>
          Makes a folder for the business and copies the business template into it. You are the
          Owner.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex flex-col gap-4">
          <Label className="flex flex-col items-stretch" htmlFor={`${id}-name`}>
            Business name
            <Input
              id={`${id}-name`}
              autoFocus
              value={name}
              maxLength={80}
              disabled={createdRoot !== null}
              onChange={(event) => setName(event.target.value)}
            />
          </Label>
          <Label className="flex flex-col items-stretch" htmlFor={`${id}-owner`}>
            Your name (the Owner)
            <Input
              id={`${id}-owner`}
              value={ownerName}
              maxLength={80}
              onChange={(event) => setOwnerName(event.target.value)}
            />
          </Label>
          <p className="text-xs text-muted-foreground">
            Goes in <code>{folder}</code>.
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
        <Button type="submit" disabled={busy || !name.trim() || !ownerName.trim()}>
          {busy ? <Spinner /> : null}
          Create business
        </Button>
      </DialogFooter>
    </form>
  );
}

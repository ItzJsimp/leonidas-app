import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";
import { useId, useState, type FormEvent } from "react";

import { Button } from "~/components/ui/button";
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
import { useComposerDraftStore } from "~/composerDraftStore";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { newProjectId } from "~/lib/utils";
import { aiosProjectScaffold } from "~/state/aiosWorkspaces";
import { waitForProject } from "~/state/entities";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";

import { projectFillInPrompt, projectFolderPreview } from "./aiosProject.logic";
import { useNewAiosProjectStore } from "./newAiosProjectStore";
import { useAiosProjectRoot } from "./useAiosProjectRoot";

/**
 * New project in one step: a name and one sentence. The app copies the project template into
 * `<AIOS>/projects/<slug>`, adds that folder as a project and opens a chat in it with a first
 * message ready, so the agent can ask the user the questions that fill the template.
 */
export function NewAiosProjectDialog() {
  const open = useNewAiosProjectStore((store) => store.open);
  const { environmentId, root } = useAiosProjectRoot();
  if (!open || environmentId === null || root === null) return null;
  const close = () => useNewAiosProjectStore.setState({ open: false });
  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : close())}>
      <DialogPopup>
        <NewAiosProjectForm environmentId={environmentId} root={root} onDone={close} />
      </DialogPopup>
    </Dialog>
  );
}

function NewAiosProjectForm(props: {
  readonly environmentId: EnvironmentId;
  readonly root: string;
  readonly onDone: () => void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A retry after the folder was made reuses it, so the template is never copied twice.
  const [madeRoot, setMadeRoot] = useState<string | null>(null);
  const scaffold = useAtomCommand(aiosProjectScaffold, { reportFailure: false });
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const handleNewThread = useNewThreadHandler();
  const setPrompt = useComposerDraftStore((store) => store.setPrompt);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const title = name.trim();
    setBusy(true);
    setError(null);
    let folder = madeRoot;
    if (folder === null) {
      const made = await scaffold({
        environmentId: props.environmentId,
        input: { root: props.root, name: title, purpose: purpose.trim() },
      });
      if (made._tag !== "Success") {
        setBusy(false);
        setError(
          "Could not make the project folder. Check that your AIOS folder can be written to.",
        );
        return;
      }
      folder = made.value.root;
      setMadeRoot(folder);
    }
    const projectId = newProjectId();
    const created = await createProject({
      environmentId: props.environmentId,
      input: {
        projectId,
        title,
        workspaceRoot: folder,
        createWorkspaceRootIfMissing: false,
        defaultModelSelection: null,
      },
    });
    if (created._tag !== "Success") {
      setBusy(false);
      setError(
        "The folder is ready, but the app could not add it. Press Create project to try again.",
      );
      return;
    }
    const projectRef = scopeProjectRef(props.environmentId, projectId);
    // Drafts key off the project's stored path, so wait for it to reach the store first.
    const project = await waitForProject(projectRef).catch(() => null);
    const draft = project === null ? null : await handleNewThread(projectRef).catch(() => null);
    if (draft !== null) setPrompt(draft.draftId, projectFillInPrompt(title));
    setBusy(false);
    props.onDone();
  };

  return (
    <form className="contents" onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>New project</DialogTitle>
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
              disabled={madeRoot !== null}
              onChange={(event) => setName(event.target.value)}
            />
          </Label>
          <Label className="flex flex-col items-stretch" htmlFor={`${id}-purpose`}>
            What is it, in one sentence?
            <Input
              id={`${id}-purpose`}
              value={purpose}
              maxLength={300}
              disabled={madeRoot !== null}
              onChange={(event) => setPurpose(event.target.value)}
            />
          </Label>
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-3.5 py-3">
            <div className="flex flex-col gap-1">
              <span className="font-medium text-xs">Saved in</span>
              <code className="break-all text-muted-foreground text-xs/relaxed">
                {madeRoot ?? projectFolderPreview(props.root, name.trim())}
              </code>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-medium text-xs">Built from the Leonidas project template</span>
              <span className="text-muted-foreground text-xs/relaxed">
                Goal, rules, spec and notes files, ready for the agent to fill in with you.
              </span>
            </div>
          </div>
          <p className="text-muted-foreground text-xs/relaxed">
            A chat in that folder reads only this project, so answers improve and cost less.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={props.onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? <Spinner /> : null}
          Create project
        </Button>
      </DialogFooter>
    </form>
  );
}

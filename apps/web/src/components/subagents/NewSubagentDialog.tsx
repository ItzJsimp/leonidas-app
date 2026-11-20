import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, SubagentCatalogEntry, SubagentSpecPatch } from "@t3tools/contracts";
import { ArrowLeftIcon, SparklesIcon } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { Badge } from "~/components/ui/badge";
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
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { subagentCreate, subagentDraft, subagentUpdate } from "~/state/subagents";
import { workspaceScopeInput } from "~/components/workspace/aiosWorkspace.logic";
import { activeWorkspaceId } from "~/components/workspace/aiosWorkspaceStore";
import { useAtomCommand } from "~/state/use-atom-command";

import { AvatarPicker } from "./AvatarPicker";
import { defaultAvatar } from "./avatar.logic";
import {
  basicsProblem,
  DEFAULT_AGENT_MODEL,
  DEFAULT_CREATOR_MODEL,
  draftInput,
  previewDraft,
} from "./createAgent.logic";
import { writeFailureMessage } from "./SubagentEditor";
import { ModelSelect } from "./ModelSelect";
import { modelDisplayName } from "./spawnApproval.logic";
import {
  BUILT_IN_TOOLS,
  EFFORT_SUGGESTIONS,
  knownFreeModels,
  maxTurnsProblem,
  parseToolList,
  slugifySubagentName,
} from "./subagentEdit.logic";

interface CreateProps {
  readonly environmentId: EnvironmentId;
  readonly entries: ReadonlyArray<SubagentCatalogEntry>;
  readonly hasAios: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (entry: SubagentCatalogEntry) => void;
}

/**
 * New agent. Step 1 asks for a name, an avatar and the model, because the model sets the cost.
 * Step 2 is a chat: one sentence makes a draft, and each next message changes it. Nothing is
 * written until Create. New agents go to the AIOS folder.
 */
export function NewSubagentDialog(props: CreateProps & { readonly open: boolean }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup>{props.open ? <CreateFlow {...props} /> : null}</DialogPopup>
    </Dialog>
  );
}

function CreateFlow(props: CreateProps) {
  const create = useAtomCommand(subagentCreate, { reportFailure: false });
  const update = useAtomCommand(subagentUpdate, { reportFailure: false });
  const requestDraft = useAtomCommand(subagentDraft, { reportFailure: false });
  const [step, setStep] = useState<"basics" | "chat">("basics");
  const [nameText, setNameText] = useState("");
  const [avatarChoice, setAvatarChoice] = useState<string | null>(null);
  const [model, setModel] = useState(DEFAULT_AGENT_MODEL);
  const [request, setRequest] = useState("");
  const [asked, setAsked] = useState<ReadonlyArray<{ id: number; text: string }>>([]);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftInfo, setDraftInfo] = useState<{ roughCost: string; capWarning: boolean } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<{ roughCost: string; model: string } | null>(null);
  const [toolsPicked, setToolsPicked] = useState<ReadonlyArray<string> | null>(null);
  const [extraTools, setExtraTools] = useState("");
  const [effort, setEffort] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [canSpawn, setCanSpawn] = useState(false);
  const [maxTurns, setMaxTurns] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  const name = slugifySubagentName(nameText);
  const avatar = avatarChoice ?? defaultAvatar(name ?? "");
  const takenNames = new Set(
    props.entries.filter((entry) => entry.source === "aios").map((entry) => entry.name),
  );
  const problem = basicsProblem({ nameText, model, takenNames });
  const free = knownFreeModels(props.entries).has(model.trim());
  const preview = draft === null ? null : previewDraft(draft);
  const tools = toolsPicked ?? preview?.tools ?? [];
  const turnsProblem = maxTurnsProblem(maxTurns);

  const generate = async (confirmed: boolean) => {
    if (name === null || request.trim() === "" || busy) return;
    setBusy(true);
    setError(null);
    const result = await requestDraft({
      environmentId: props.environmentId,
      input: draftInput({ name, avatar, model, request, currentDraft: draft, confirmed }),
    });
    setBusy(false);
    if (result._tag === "Success") {
      const value = result.value;
      if (value.kind === "needs_confirm") {
        setConfirm({ roughCost: value.roughCost, model: value.model });
        return;
      }
      setConfirm(null);
      setDraft(value.contents);
      setDraftInfo({ roughCost: value.roughCost, capWarning: value.capWarning });
      setAsked((previous) => [...previous, { id: previous.length, text: request.trim() }]);
      setRequest("");
      setToolsPicked(null);
      return;
    }
    if (isAtomCommandInterrupted(result)) return;
    setError(writeFailureMessage(squashAtomCommandFailure(result), "The draft failed. Try again."));
  };

  const save = async () => {
    if (name === null || draft === null || busy || turnsProblem !== null) return;
    setBusy(true);
    setError(null);
    const scope = workspaceScopeInput(activeWorkspaceId(props.environmentId));
    const created = await create({
      environmentId: props.environmentId,
      input: { ...scope, name, contents: draft, destination: { kind: "aios" } },
    });
    if (created._tag !== "Success") {
      setBusy(false);
      if (isAtomCommandInterrupted(created)) return;
      setError(
        writeFailureMessage(squashAtomCommandFailure(created), "It was not created. Try again."),
      );
      return;
    }
    // The Advanced fields go in as one change to the file the server just wrote.
    const finalTools = [...tools, ...parseToolList(extraTools)];
    const patch: SubagentSpecPatch = {
      ...(finalTools.join(",") === (preview?.tools ?? []).join(",") ? {} : { tools: finalTools }),
      ...(effort.trim() === "" ? {} : { effort: effort.trim() }),
      ...(parseToolList(skillsText).length === 0 ? {} : { skills: parseToolList(skillsText) }),
      ...(canSpawn ? { canSpawn: true } : {}),
      ...(maxTurns.trim() === "" ? {} : { maxTurns: Number(maxTurns.trim()) }),
    };
    let entry = created.value;
    if (Object.keys(patch).length > 0) {
      const updated = await update({
        environmentId: props.environmentId,
        input: { ...scope, specPath: created.value.specPath, patch },
      });
      if (updated._tag === "Success") entry = updated.value;
      else if (!isAtomCommandInterrupted(updated)) {
        setBusy(false);
        setError(
          `${created.value.name} was created, but its Advanced settings did not save: ${writeFailureMessage(
            squashAtomCommandFailure(updated),
            "Open Edit and set them again.",
          )}`,
        );
        props.onCreated(created.value);
        return;
      }
    }
    setBusy(false);
    props.onOpenChange(false);
    props.onCreated(entry);
  };

  const onBasicsSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (problem === null && props.hasAios) setStep("chat");
  };
  const onChatSubmit = (event: FormEvent) => {
    event.preventDefault();
    void generate(false);
  };

  if (step === "basics") {
    return (
      <form className="flex min-h-0 flex-col" onSubmit={onBasicsSubmit}>
        <DialogHeader>
          <DialogTitle>New agent: name, avatar and model</DialogTitle>
          <DialogDescription>
            Step 1 of 2. The model sets what a run costs, so you pick it first.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${ids}-name`} className="font-medium">
                Name
              </label>
              <Input
                id={`${ids}-name`}
                autoFocus
                value={nameText}
                placeholder="my-scout"
                onChange={(event) => setNameText(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {name === null ? "Lowercase words joined by dashes." : `Saved as ${name}.md`}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-medium">Avatar</span>
              <AvatarPicker value={avatar} onChange={setAvatarChoice} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${ids}-model`} className="font-medium">
                Model
              </label>
              <ModelSelect id={`${ids}-model`} value={model} onChange={setModel} />
              <p className="text-xs text-muted-foreground">
                {model.trim() === ""
                  ? "Pick a model."
                  : free
                    ? `${modelDisplayName(model.trim())} is free tier. This agent starts at once.`
                    : `${modelDisplayName(model.trim())} is not known as free. Each start shows a card with the cost.`}
              </p>
            </div>
            {props.hasAios ? null : (
              <p role="alert" className="rounded-md bg-warning/10 px-3 py-2">
                Connect your AIOS folder on Home. New agents are saved there.
              </p>
            )}
            {problem === null || nameText.trim() === "" ? null : (
              <p role="status" className="text-xs text-destructive-foreground">
                {problem}
              </p>
            )}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={problem !== null || !props.hasAios}>
            Next
          </Button>
        </DialogFooter>
      </form>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>New agent: {name}</DialogTitle>
        <DialogDescription>
          Step 2 of 2. Say what the agent does in one sentence. Then ask for changes until it fits.
        </DialogDescription>
        <Badge variant="outline" size="sm" className="mt-1 w-fit">
          Creator: {modelDisplayName(DEFAULT_CREATOR_MODEL)}
        </Badge>
      </DialogHeader>
      <DialogPanel>
        <div className="flex flex-col gap-4 text-sm">
          {asked.length === 0 ? null : (
            <ol aria-label="Your messages" className="flex flex-col gap-1.5">
              {asked.map((message) => (
                <li
                  key={message.id}
                  className="max-w-[85%] self-end rounded-lg bg-accent px-3 py-1.5"
                >
                  {message.text}
                </li>
              ))}
            </ol>
          )}

          {preview === null ? null : (
            <section
              aria-label="Draft"
              className="flex flex-col gap-2 rounded-lg border border-border p-3"
            >
              <p className="font-medium">{preview.description || "No description yet"}</p>
              <ul className="flex flex-wrap gap-1">
                {preview.tools.map((tool) => (
                  <li key={tool}>
                    <Badge variant="outline" size="sm">
                      {tool}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="max-h-40 overflow-y-auto text-xs whitespace-pre-wrap text-muted-foreground">
                {preview.instructions}
              </p>
              {draftInfo === null ? null : (
                <p className="text-xs text-muted-foreground">
                  This draft cost {draftInfo.roughCost}.
                  {draftInfo.capWarning ? " You are near your daily cap." : ""}
                </p>
              )}
            </section>
          )}

          {confirm === null ? null : (
            <div role="alert" className="flex flex-col gap-2 rounded-md bg-warning/10 px-3 py-2">
              <p>
                The draft runs on {modelDisplayName(confirm.model)}. It costs {confirm.roughCost}.
              </p>
              <div>
                <Button size="sm" disabled={busy} onClick={() => void generate(true)}>
                  Run the draft
                </Button>
              </div>
            </div>
          )}

          <form onSubmit={onChatSubmit} className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-request`} className="font-medium">
              {draft === null ? "What does this agent do?" : "Ask for a change"}
            </label>
            <Textarea
              id={`${ids}-request`}
              autoFocus
              rows={2}
              maxLength={2_000}
              value={request}
              placeholder={
                draft === null
                  ? "Finds the files a task needs and reports their paths."
                  : "Shorter."
              }
              onChange={(event) => setRequest(event.target.value)}
            />
            <div>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={busy || request.trim() === ""}
              >
                {busy ? <Spinner /> : <SparklesIcon aria-hidden />}
                {draft === null ? "Draft it" : "Change the draft"}
              </Button>
            </div>
          </form>

          {draft === null ? null : (
            <details className="rounded-lg border border-border px-3 py-2">
              <summary className="cursor-pointer font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                Advanced
              </summary>
              <div className="mt-3 flex flex-col gap-4">
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="font-medium">Tools</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {BUILT_IN_TOOLS.map((tool) => (
                      <label key={tool} className="flex items-center gap-1.5 font-mono text-xs">
                        <input
                          type="checkbox"
                          checked={tools.includes(tool)}
                          onChange={() =>
                            setToolsPicked(
                              tools.includes(tool)
                                ? tools.filter((item) => item !== tool)
                                : [...tools, tool],
                            )
                          }
                        />
                        {tool}
                      </label>
                    ))}
                  </div>
                  <label htmlFor={`${ids}-extra`} className="mt-1 text-xs text-muted-foreground">
                    Other tools, such as app tools (comma separated)
                  </label>
                  <Input
                    id={`${ids}-extra`}
                    value={extraTools}
                    onChange={(event) => setExtraTools(event.target.value)}
                  />
                </fieldset>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${ids}-effort`} className="font-medium">
                    Effort
                  </label>
                  <Input
                    id={`${ids}-effort`}
                    value={effort}
                    list={`${ids}-efforts`}
                    placeholder="Not set (the engine default)"
                    onChange={(event) => setEffort(event.target.value)}
                  />
                  <datalist id={`${ids}-efforts`}>
                    {EFFORT_SUGGESTIONS.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${ids}-skills`} className="font-medium">
                    Skills
                  </label>
                  <Input
                    id={`${ids}-skills`}
                    value={skillsText}
                    placeholder="plan-slices, ui-build"
                    onChange={(event) => setSkillsText(event.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2">
                  <Switch
                    size="sm"
                    checked={canSpawn}
                    onCheckedChange={setCanSpawn}
                    aria-label="Can start other agents"
                  />
                  Can start other agents (a lead)
                </label>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${ids}-turns`} className="font-medium">
                    Max turns
                  </label>
                  <Input
                    id={`${ids}-turns`}
                    value={maxTurns}
                    inputMode="numeric"
                    placeholder="No limit"
                    aria-invalid={turnsProblem !== null}
                    onChange={(event) => setMaxTurns(event.target.value)}
                  />
                  {turnsProblem === null ? null : (
                    <p role="alert" className="text-xs text-destructive-foreground">
                      {turnsProblem}
                    </p>
                  )}
                </div>
              </div>
            </details>
          )}

          {error === null ? null : (
            <p role="alert" className="rounded-md bg-destructive/8 px-3 py-2">
              {error}
            </p>
          )}
        </div>
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => setStep("basics")}>
          <ArrowLeftIcon aria-hidden />
          Back
        </Button>
        <Button
          type="button"
          disabled={draft === null || busy || turnsProblem !== null}
          onClick={() => void save()}
        >
          {busy ? <Spinner /> : null}
          Create agent
        </Button>
      </DialogFooter>
    </div>
  );
}

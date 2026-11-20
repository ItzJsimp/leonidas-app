import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, SubagentCatalogEntry } from "@t3tools/contracts";
import { PlusIcon, XIcon } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { subagentUpdate } from "~/state/subagents";
import { workspaceScopeInput } from "~/components/workspace/aiosWorkspace.logic";
import { activeWorkspaceId } from "~/components/workspace/aiosWorkspaceStore";
import { useAtomCommand } from "~/state/use-atom-command";
import { AvatarPicker } from "./AvatarPicker";
import { ModelSelect } from "./ModelSelect";
import { modelDisplayName } from "./spawnApproval.logic";
import {
  BUILT_IN_TOOLS,
  draftFromEntry,
  EFFORT_SUGGESTIONS,
  isEmptyPatch,
  maxTurnsProblem,
  parseToolList,
  patchFromDraft,
  raisesSpend,
  type SubagentDraft,
} from "./subagentEdit.logic";

/** The message a failed Studio write shows: the server's own words when it sent any. */
export function writeFailureMessage(failure: unknown, fallback: string): string {
  return failure instanceof Error && failure.message.length > 0 ? failure.message : fallback;
}

/**
 * Edit panel for one subagent: description, model, tools and Context List.
 * It saves only the fields that changed. A move to a model that is not known
 * to be free asks first, because that model shows a confirm card on every start.
 */
export function SubagentEditor(props: {
  readonly environmentId: EnvironmentId;
  readonly entry: SubagentCatalogEntry;
  readonly knownFree: ReadonlySet<string>;
  readonly onDone: () => void;
}) {
  const { entry } = props;
  const update = useAtomCommand(subagentUpdate, { reportFailure: false });
  const [draft, setDraft] = useState<SubagentDraft>(() => draftFromEntry(entry));
  const [extraTools, setExtraTools] = useState(() =>
    entry.tools.filter((tool) => !BUILT_IN_TOOLS.includes(tool)).join(", "),
  );
  const [skillsText, setSkillsText] = useState(() => (entry.skills ?? []).join(", "));
  const [newContext, setNewContext] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  const builtIn = draft.tools.filter((tool) => BUILT_IN_TOOLS.includes(tool));
  const draftWithTools: SubagentDraft = {
    ...draft,
    tools: [...builtIn, ...parseToolList(extraTools)],
    skills: parseToolList(skillsText),
  };
  const patch = patchFromDraft(entry, draftWithTools);
  const unchanged = isEmptyPatch(patch);
  const turnsProblem = maxTurnsProblem(draft.maxTurns);

  const save = async () => {
    setBusy(true);
    setError(null);
    const result = await update({
      environmentId: props.environmentId,
      input: {
        ...workspaceScopeInput(activeWorkspaceId(props.environmentId)),
        specPath: entry.specPath,
        patch,
      },
    });
    setBusy(false);
    if (result._tag === "Success") return props.onDone();
    if (isAtomCommandInterrupted(result)) return;
    setConfirming(false);
    setError(
      writeFailureMessage(squashAtomCommandFailure(result), "The change did not save. Try again."),
    );
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || unchanged || turnsProblem !== null) return;
    if (raisesSpend(patch, props.knownFree) && !confirming) {
      setConfirming(true);
      return;
    }
    void save();
  };

  const toggleTool = (tool: string) =>
    setDraft((current) => ({
      ...current,
      tools: current.tools.includes(tool)
        ? current.tools.filter((item) => item !== tool)
        : [...current.tools, tool],
    }));

  const addContext = () => {
    const path = newContext.trim();
    if (path.length === 0 || draft.context.includes(path)) return;
    setDraft((current) => ({ ...current, context: [...current.context, path] }));
    setNewContext("");
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 text-sm"
      aria-label={`Edit ${entry.name}`}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-description`} className="font-medium">
          Description
        </label>
        <Textarea
          id={`${ids}-description`}
          value={draft.description}
          rows={2}
          maxLength={400}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="font-medium">Avatar</span>
        <AvatarPicker value={draft.avatar} onChange={(avatar) => setDraft({ ...draft, avatar })} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-instructions`} className="font-medium">
          Instructions
        </label>
        <Textarea
          id={`${ids}-instructions`}
          value={draft.instructions}
          rows={8}
          maxLength={20_000}
          onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-model`} className="font-medium">
          Model
        </label>
        <ModelSelect
          id={`${ids}-model`}
          value={draft.model}
          unsetLabel="Not set (follows its base or the app default)"
          onChange={(model) => {
            setConfirming(false);
            setDraft({ ...draft, model });
          }}
        />
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="font-medium">Tools</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {BUILT_IN_TOOLS.map((tool) => (
            <label key={tool} className="flex items-center gap-1.5 font-mono text-xs">
              <input
                type="checkbox"
                checked={draft.tools.includes(tool)}
                onChange={() => toggleTool(tool)}
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
          className="font-mono text-xs"
          onChange={(event) => setExtraTools(event.target.value)}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="font-medium">Context List</legend>
        {draft.context.length === 0 ? (
          <p className="text-xs text-muted-foreground">Persona only. No files load with it.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {draft.context.map((path) => (
              <li key={path} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={path}>
                  {path}
                </span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remove ${path}`}
                  onClick={() =>
                    setDraft({ ...draft, context: draft.context.filter((item) => item !== path) })
                  }
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <Input
            value={newContext}
            aria-label="Add a context file path"
            placeholder="skills/ui-build/SKILL.md"
            className="font-mono text-xs"
            onChange={(event) => setNewContext(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              addContext();
            }}
          />
          <Button type="button" size="sm" variant="outline" onClick={addContext}>
            <PlusIcon />
            Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Paths are relative to the folder that holds .agents/.
        </p>
      </fieldset>

      <details className="rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          Advanced
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-effort`} className="font-medium">
              Effort
            </label>
            <Input
              id={`${ids}-effort`}
              value={draft.effort}
              list={`${ids}-efforts`}
              placeholder="Not set (the engine default)"
              onChange={(event) => setDraft({ ...draft, effort: event.target.value })}
            />
            <datalist id={`${ids}-efforts`}>
              {EFFORT_SUGGESTIONS.map((effort) => (
                <option key={effort} value={effort} />
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
            <p className="text-xs text-muted-foreground">
              Skill names, comma separated. They join the Context List.
            </p>
          </div>
          <label className="flex items-center gap-2">
            <Switch
              size="sm"
              checked={draft.canSpawn}
              onCheckedChange={(checked) => setDraft({ ...draft, canSpawn: checked })}
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
              value={draft.maxTurns}
              inputMode="numeric"
              placeholder="No limit"
              aria-invalid={turnsProblem !== null}
              onChange={(event) => setDraft({ ...draft, maxTurns: event.target.value })}
            />
            {turnsProblem === null ? null : (
              <p role="alert" className="text-xs text-destructive-foreground">
                {turnsProblem}
              </p>
            )}
          </div>
        </div>
      </details>

      {confirming ? (
        <p role="alert" className="rounded-md bg-warning/10 px-3 py-2">
          {modelDisplayName(draft.model.trim())} is not a free-tier model. This subagent will show a
          confirm card with its start cost before every start. Save anyway?
        </p>
      ) : null}
      {error === null ? null : (
        <p role="alert" className="rounded-md bg-destructive/8 px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy || unchanged || turnsProblem !== null}>
          {busy ? <Spinner /> : null}
          {confirming ? "Save anyway" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={props.onDone} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

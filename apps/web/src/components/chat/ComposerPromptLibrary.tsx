import { CommandId, type EnvironmentId, type ProjectId, type SavedItem } from "@t3tools/contracts";
import { FileTextIcon, FolderIcon, PinIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { memo, useMemo, useRef, useState } from "react";

import { randomUUID } from "../../lib/utils";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { toastManager } from "../ui/toast";
import { useProjectAiosWorkspace } from "../workspace/useProjectAiosWorkspace";
import {
  SAVED_GROUP,
  filterPrompts,
  promptGroup,
  promptGroups,
  savedPromptTitle,
} from "./promptLibrary";

/** The last two path parts, so the footer says `Leonidas AIOS/prompts` and not a drive path. */
const shortPath = (path: string) => path.split(/[\\/]/).filter(Boolean).slice(-2).join("/");

/**
 * The prompt library the plus menu opens: the `prompts/` folder of the AIOS, in groups, with
 * search. Use hands a prompt to the composer. Save this message writes the draft as a new file.
 */
export const ComposerPromptLibrary = memo(function ComposerPromptLibrary(props: {
  environmentId: EnvironmentId;
  projectId: ProjectId | null;
  draft: string;
  onUse: (body: string) => void;
  onManage: () => void;
}) {
  const workspace = useProjectAiosWorkspace(
    props.projectId ? { environmentId: props.environmentId, projectId: props.projectId } : null,
  );
  const [group, setGroup] = useState<string | null>(SAVED_GROUP);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const saveCommandId = useRef<CommandId | null>(null);
  const create = useAtomCommand(serverEnvironment.createSavedItem);
  const query = useEnvironmentQuery(
    workspace.scopeReady
      ? serverEnvironment.savedItems({
          environmentId: props.environmentId,
          input: { ...workspace.scope, projectId: null, kind: "prompt" },
        })
      : null,
  );
  const items = useMemo(
    () => (query.data?.items ?? []).filter((item) => item.status !== "archived"),
    [query.data?.items],
  );
  const groups = useMemo(() => promptGroups(items), [items]);
  // A group that no longer exists (the last file was deleted) falls back to All.
  const activeGroup = group !== null && groups.some((g) => g.name === group) ? group : null;
  const rows = useMemo(
    () => filterPrompts(items, activeGroup, search),
    [items, activeGroup, search],
  );
  const folder = query.data?.promptsFolder;
  const draft = props.draft.trim();

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    saveCommandId.current ??= CommandId.make(randomUUID());
    try {
      const result = await create({
        environmentId: props.environmentId,
        input: {
          ...workspace.scope,
          commandId: saveCommandId.current,
          kind: "prompt",
          title: savedPromptTitle(draft),
          body: draft,
          tags: [],
          projectId: null,
        },
      });
      if (result._tag === "Failure") throw result;
      saveCommandId.current = null;
      setGroup(SAVED_GROUP);
      query.refresh();
      toastManager.add({ type: "success", title: "Saved to your prompt library" });
    } catch {
      toastManager.add({
        type: "error",
        title: "Could not save the message",
        description: "Try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-82.5 min-h-0">
      <div className="hidden w-40 shrink-0 flex-col gap-px border-r p-1.5 sm:flex">
        {[
          { name: null, label: "All", count: items.length },
          ...groups.map((g) => ({ ...g, label: g.name })),
        ].map((entry) => (
          <button
            key={entry.label}
            type="button"
            aria-pressed={activeGroup === entry.name}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent aria-pressed:bg-accent"
            onClick={() => setGroup(entry.name)}
          >
            {entry.name === SAVED_GROUP ? (
              <PinIcon className="size-3.5" />
            ) : (
              <FolderIcon className="size-3.5" />
            )}
            <span className="truncate">{entry.label}</span>
            <span className="ml-auto text-xs text-muted-foreground">{entry.count}</span>
          </button>
        ))}
        <button
          type="button"
          className="mt-auto flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          onClick={props.onManage}
        >
          <SettingsIcon className="size-3.5" />
          Manage
        </button>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="p-2">
          <Input
            autoFocus
            value={search}
            placeholder={`Search ${items.length} prompts`}
            aria-label="Search prompts"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {rows.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              {query.data ? "No prompts match" : "Loading..."}
            </p>
          ) : (
            <ul className="flex flex-col px-1.5 pb-1">
              {rows.map((item) => (
                <PromptRow key={item.id} item={item} onUse={props.onUse} />
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="flex items-center gap-2 border-t px-2.5 py-2 text-xs text-muted-foreground">
          <span
            aria-hidden
            className={`size-1.5 shrink-0 rounded-full ${folder?.present ? "bg-success" : "bg-warning"}`}
          />
          <span className="truncate">
            {folder?.present && folder.path
              ? `Synced with ${shortPath(folder.path)}`
              : "No prompts folder. Saves stay in the app."}
          </span>
          <Button
            size="xs"
            variant="outline"
            className="ml-auto shrink-0"
            disabled={!draft || saving || !workspace.scopeReady}
            onClick={() => void save()}
          >
            <PlusIcon />
            Save this message
          </Button>
        </div>
      </div>
    </div>
  );
});

function PromptRow(props: { item: SavedItem; onUse: (body: string) => void }) {
  const { item } = props;
  return (
    <li>
      <button
        type="button"
        className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
        onClick={() => props.onUse(item.body)}
      >
        {promptGroup(item) === SAVED_GROUP ? (
          <PinIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
        ) : (
          <FileTextIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{item.body}</span>
        </span>
        <span className="mt-0.5 shrink-0 rounded-md border px-2 py-0.5 text-xs opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
          Use
        </span>
      </button>
    </li>
  );
}

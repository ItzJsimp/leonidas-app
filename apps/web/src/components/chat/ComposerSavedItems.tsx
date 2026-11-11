import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BookmarkPlusIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  ListPlusIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CommandId,
  type EnvironmentId,
  type ModelSelection,
  type ProjectId,
  type ProviderInteractionMode,
  type RuntimeMode,
  type SavedItem,
  type SavedItemStatus,
  type ThreadId,
} from "@t3tools/contracts";
import {
  type AtomCommandResult,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { parseSavedItemMarkdown, renderSavedItemMarkdown } from "@t3tools/shared/savedItemMarkdown";
import {
  useComposerDraftStore,
  composerTargetKey,
  type ComposerThreadTarget,
} from "../../composerDraftStore";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { cn, newMessageId, randomUUID } from "../../lib/utils";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Sheet, SheetDescription, SheetHeader, SheetPopup, SheetTitle } from "../ui/sheet";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";
import { DictationTextarea } from "../voice/DictationTextarea";
import { ComposerBanner } from "./ComposerBanner";
import { createDraftSaver } from "./savedDraft";
import { useProjectAiosWorkspace } from "../workspace/useProjectAiosWorkspace";

/** Pasted into an agent chat, it makes the AIOS prompts folder the app reads. */
const PROMPTS_FOLDER_SETUP = `Set up the prompts folder in my AIOS so Leonidas can read my saved prompts.
1. Find my AIOS root (the folder with tasks/ and projects/). If you cannot find it, ask me.
2. Create the folder prompts/ at that root.
3. Add one sample file prompts/example.md. Start it with frontmatter that has type: prompt and a title, then the prompt text.
4. Tell me the full path when you are done.`;

type Props = {
  environmentId: EnvironmentId;
  projectId: ProjectId | null;
  target: ComposerThreadTarget;
  modelSelection: ModelSelection;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  canSave: boolean;
  /** The open started thread, where a saved prompt can be lined up behind its running work. */
  threadId: ThreadId | null;
  /** Another control opens the sheet, so the bar with Save and Saved messages stays hidden. */
  sheet?: { open: boolean; onOpenChange: (open: boolean) => void };
};

function unwrap<A, E>(result: AtomCommandResult<A, E>): A {
  if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  return result.value;
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Server-backed saves are separate from the composer's local attachment-capable stash. */
export function ComposerSavedItems(props: Props) {
  const workspace = useProjectAiosWorkspace(
    props.projectId ? { environmentId: props.environmentId, projectId: props.projectId } : null,
  );
  const [localOpen, setLocalOpen] = useState(false);
  const open = props.sheet?.open ?? localOpen;
  const setOpen = props.sheet?.onOpenChange ?? setLocalOpen;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const targetRef = useRef(props.target);
  useLayoutEffect(() => {
    targetRef.current = props.target;
  }, [props.target]);
  const draft = useComposerDraftStore((state) => state.getComposerDraft(props.target));
  const canOperate = useAtomValue(
    serverEnvironment.createSavedItem.permissionAtom(props.environmentId),
  );
  const create = useAtomCommand(serverEnvironment.createSavedItem);
  const task = useAtomCommand(serverEnvironment.saveSavedItemAsTask);
  const saver = useMemo(
    () =>
      createDraftSaver({
        create: async (input) =>
          unwrap(
            await create({
              environmentId: props.environmentId,
              input: { ...input, ...workspace.scope },
            }),
          ),
        saveTask: async (input) =>
          unwrap(await task({ environmentId: props.environmentId, input })),
      }),
    [create, task, props.environmentId, workspace.scope],
  );
  const hasContext =
    !!draft &&
    [
      draft.images,
      draft.files,
      draft.persistedAttachments,
      draft.terminalContexts,
      draft.previewAnnotations,
      draft.reviewComments,
      draft.threadContexts,
    ].some((items) => items.length > 0);
  const disabled =
    !workspace.scopeReady ||
    !canOperate ||
    !props.canSave ||
    busy ||
    !draft?.prompt.trim() ||
    hasContext;
  const save = async (kind: "prompt" | "note" | "task") => {
    if (disabled || !draft) return;
    const captured = draft;
    const target = props.target;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await saver.save(
        { key: composerTargetKey(target), body: captured.prompt, kind, projectId: props.projectId },
        () =>
          composerTargetKey(targetRef.current) === composerTargetKey(target) &&
          useComposerDraftStore.getState().getComposerDraft(target) === captured,
        () => useComposerDraftStore.getState().setPrompt(target, ""),
      );
      setNotice(kind === "task" ? "Saved to Tasks" : `Saved as ${kind}`);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {props.sheet ? null : (
        <ComposerBanner.Root density="comfortable" width="content" data-tour="saved-items">
          <div className="flex items-center gap-1">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setOpen(true)}
              aria-label="Open saved messages"
            >
              <BookmarkPlusIcon />
              <span data-composer-toolbar-label>Saved messages</span>
            </Button>
            {draft?.prompt.trim() ? (
              <div className="flex items-center">
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => void save("prompt")}
                >
                  {busy ? "Saving…" : "Save"}
                </Button>
                <Menu>
                  <MenuTrigger
                    render={
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        disabled={disabled}
                        aria-label="Choose what to save it as"
                      />
                    }
                  >
                    <ChevronDownIcon />
                  </MenuTrigger>
                  <MenuPopup>
                    <MenuItem onClick={() => void save("prompt")}>Save as message</MenuItem>
                    <MenuItem onClick={() => void save("task")}>Save as task</MenuItem>
                    <MenuItem onClick={() => void save("note")}>Save as note</MenuItem>
                  </MenuPopup>
                </Menu>
              </div>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="max-w-64 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-xs text-muted-foreground">
              {notice}
            </p>
          ) : null}
          {hasContext && draft?.prompt.trim() ? (
            <p className="max-w-64 text-xs text-muted-foreground">
              To save the text only, remove the files and attached items. Or save a draft instead.
            </p>
          ) : null}
        </ComposerBanner.Root>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetPopup>
          <SheetHeader>
            <SheetTitle>Saved messages</SheetTitle>
            <SheetDescription>
              Keep ideas for later. Edit them, add them to the waiting messages, or start them in a
              new chat when you are ready.
            </SheetDescription>
          </SheetHeader>
          {open ? (
            <SavedItemsPanel {...props} canOperate={canOperate} close={() => setOpen(false)} />
          ) : null}
        </SheetPopup>
      </Sheet>
    </>
  );
}

function FilterMenu<T extends string>(props: {
  label: string;
  value: T;
  values: readonly T[];
  display?: (value: T) => string;
  onChange: (value: T) => void;
}) {
  const show = props.display ?? ((value: T) => value);
  return (
    <Menu>
      <MenuTrigger render={<Button size="sm" variant="outline" aria-label={props.label} />}>
        {show(props.value)}
        <ChevronDownIcon />
      </MenuTrigger>
      <MenuPopup>
        {props.values.map((value) => (
          <MenuItem key={value} onClick={() => props.onChange(value)}>
            {show(value)}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

type StatusFilter = SavedItemStatus | "all";
const STATUS_TABS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "queued", label: "Ready" },
  { value: "launched", label: "Started" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Removed" },
  { value: "all", label: "All" },
];
const STATUS_BADGE: Record<
  SavedItemStatus,
  { label: string; variant: "info" | "success" | "secondary" | "outline" }
> = {
  queued: { label: "Ready", variant: "info" },
  launched: { label: "Started", variant: "success" },
  done: { label: "Done", variant: "secondary" },
  archived: { label: "Removed", variant: "outline" },
};
const kindLabel = (kind: string) => (kind === "prompt" ? "message" : kind);
const EMPTY_COPY: Record<StatusFilter, string> = {
  queued: "Nothing ready to run",
  launched: "Nothing started yet",
  done: "Nothing marked done",
  archived: "Nothing removed",
  all: "Nothing saved here yet",
};

function StatusTabs(props: { value: StatusFilter; onChange: (value: StatusFilter) => void }) {
  return (
    <div
      role="group"
      aria-label="Filter saved messages by status"
      className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5"
    >
      {STATUS_TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          aria-pressed={props.value === tab.value}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-ring",
            props.value === tab.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => props.onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function SavedItemsPanel(props: Props & { canOperate: boolean; close: () => void }) {
  const workspace = useProjectAiosWorkspace(
    props.projectId ? { environmentId: props.environmentId, projectId: props.projectId } : null,
  );
  const [scope, setScope] = useState<"This project" | "No project" | "All projects">(
    props.projectId ? "This project" : "No project",
  );
  const [kind, setKind] = useState<"All types" | "prompt" | "note">("All types");
  const [status, setStatus] = useState<StatusFilter>("queued");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id: SavedItem["id"];
    title: string;
    body: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavedItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [markdown, setMarkdown] = useState("");
  const [runAt, setRunAt] = useState("");
  const ids = useRef(new Map<string, CommandId>());
  const navigate = useNavigate();
  const projectId = scope === "No project" ? null : props.projectId;
  const query = useEnvironmentQuery(
    workspace.scopeReady
      ? serverEnvironment.savedItems({
          environmentId: props.environmentId,
          input: {
            ...workspace.scope,
            ...(scope === "All projects" ? {} : { projectId }),
            ...(kind === "All types" ? {} : { kind }),
            ...(status === "all" ? {} : { status }),
          },
        })
      : null,
  );
  const transition = useAtomCommand(serverEnvironment.transitionSavedItem);
  const importItem = useAtomCommand(serverEnvironment.importSavedItem);
  const launch = useAtomCommand(serverEnvironment.launchSavedItem);
  const schedule = useAtomCommand(serverEnvironment.scheduleSavedItem);
  const task = useAtomCommand(serverEnvironment.saveSavedItemAsTask);
  const update = useAtomCommand(serverEnvironment.updateSavedItem);
  const startThreadTurn = useOrchestrationCommand(threadEnvironment.startTurn, {
    reportFailure: false,
  });
  const items = query.data?.items ?? [];
  const parsed = parseSavedItemMarkdown(markdown);
  const commandId = (key: string) => {
    const old = ids.current.get(key);
    if (old) return old;
    const id = CommandId.make(randomUUID());
    ids.current.set(key, id);
    return id;
  };
  const act = async (key: string, action: (id: CommandId) => Promise<unknown>, message: string) => {
    if (busy || !props.canOperate) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action(commandId(key));
      ids.current.delete(key);
      query.refresh();
      setNotice(message);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };
  const changeStatus = (item: SavedItem, action: "archive" | "restore" | "requeue" | "done") =>
    void act(
      `${item.id}:${action}`,
      async (commandId) =>
        unwrap(
          await transition({
            environmentId: props.environmentId,
            input: { commandId, id: item.id, action },
          }),
        ),
      action === "archive" ? "Removed. Open the Removed tab to restore it." : "Prompt updated",
    );
  const deleteItem = (item: SavedItem) =>
    void act(
      `${item.id}:delete`,
      async (commandId) => {
        unwrap(
          await transition({
            environmentId: props.environmentId,
            input: { commandId, id: item.id, action: "delete" },
          }),
        );
        setConfirmDelete(null);
        setSelectedId(null);
      },
      "Deleted",
    );
  const executionInput = (item: SavedItem, commandId: CommandId) => ({
    commandId,
    id: item.id,
    ...(item.projectId === null && props.projectId ? { projectId: props.projectId } : {}),
    modelSelection: props.modelSelection,
    runtimeMode: props.runtimeMode,
    interactionMode: props.interactionMode,
    workspaceStrategy: { type: "root" as const },
  });
  const saveEdit = () => {
    if (!editing) return;
    const { id, title, body } = editing;
    void act(
      `${id}:edit:${title}:${body}`,
      async (commandId) => {
        unwrap(
          await update({
            environmentId: props.environmentId,
            input: { commandId, id, title, body },
          }),
        );
        setEditing(null);
      },
      "Changes saved",
    );
  };
  /** Joins the thread's own queue, so it runs after the current run and any prompts queued before it. */
  const queueInThread = (item: SavedItem) => {
    const threadId = props.threadId;
    if (!threadId) return;
    void act(
      `${item.id}:queue`,
      async (commandId) => {
        const result = await startThreadTurn({
          environmentId: props.environmentId,
          input: {
            threadId,
            message: { messageId: newMessageId(), role: "user", text: item.body, attachments: [] },
            runtimeMode: props.runtimeMode,
            interactionMode: props.interactionMode,
            dispatchMode: "queue",
          },
        });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        // Out of the Ready list now that the thread holds it; Requeue brings it back.
        unwrap(
          await transition({
            environmentId: props.environmentId,
            input: { commandId, id: item.id, action: "done" },
          }),
        );
      },
      "Added to the waiting messages of this chat. You can move or cancel it there.",
    );
  };
  const importMarkdown = () =>
    void act(
      `import:${projectId}:${markdown}`,
      async (commandId) => {
        unwrap(
          await importItem({
            environmentId: props.environmentId,
            input: { commandId, markdown, projectId, ...workspace.scope },
          }),
        );
        setImportOpen(false);
        setMarkdown("");
        setStatus("queued");
        setKind("All types");
      },
      "Imported",
    );
  const needsProject = (item: SavedItem) => item.projectId === null && props.projectId === null;
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6"
      onPaste={(event) => {
        if ((event.target as HTMLElement).closest("input,textarea,[contenteditable=true]")) return;
        const text = event.clipboardData.getData("text/plain");
        if (parseSavedItemMarkdown(text).ok) {
          event.preventDefault();
          setMarkdown(text);
          setImportOpen(true);
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusTabs value={status} onChange={setStatus} />
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost-muted"
            aria-label="Reload saved messages"
            onClick={query.refresh}
          >
            <RefreshCwIcon />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!props.canOperate}
            onClick={() => setImportOpen(true)}
          >
            <DownloadIcon />
            Import
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <FilterMenu
          label="Filter by project"
          value={scope}
          values={
            props.projectId
              ? ["This project", "No project", "All projects"]
              : ["No project", "All projects"]
          }
          onChange={setScope}
        />
        <FilterMenu
          label="Filter by type"
          value={kind}
          values={["All types", "prompt", "note"] as const}
          display={(value) =>
            value === "prompt" ? "Messages" : value === "note" ? "Notes" : value
          }
          onChange={setKind}
        />
      </div>
      {error || query.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/24 bg-destructive/6 px-3 py-2 text-sm text-destructive-foreground"
        >
          {error ?? query.error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-success/24 bg-success/6 px-3 py-2 text-sm text-success-foreground"
        >
          <CheckIcon className="size-3.5 shrink-0" />
          {notice}
        </p>
      ) : null}
      {!props.canOperate ? (
        <p className="text-sm text-muted-foreground">This connection is read only.</p>
      ) : null}
      {query.data?.promptsFolder && !query.data.promptsFolder.present ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm"
          role="note"
        >
          <span className="min-w-0 flex-1 text-muted-foreground">
            {query.data.promptsFolder.path
              ? `No prompts folder at ${query.data.promptsFolder.path}. Prompts save in the app until you make one.`
              : "No AIOS folder found. Prompts save in the app. Connect an AIOS to keep them as files."}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(PROMPTS_FOLDER_SETUP)}
          >
            Copy setup prompt
          </Button>
        </div>
      ) : null}
      {query.isPending && query.data === null ? (
        <div className="space-y-2" role="status" aria-label="Loading prompts">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : items.length === 0 && !query.error ? (
        <div className="rounded-xl border border-dashed">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookmarkPlusIcon />
              </EmptyMedia>
              <EmptyTitle>{EMPTY_COPY[status]}</EmptyTitle>
              <EmptyDescription>
                Type something in the message box and press Save. Or paste Markdown you exported to
                import it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : null}
      <ul className="space-y-2" aria-label="Saved items">
        {items.map((item) => {
          const open = selectedId === item.id;
          const badge = STATUS_BADGE[item.status];
          const isEditing = editing?.id === item.id;
          const isPrompt = item.kind === "prompt";
          const scheduleOpen = !!item.scheduledTaskId && item.status !== "launched";
          const deleteBlocked =
            !!item.scheduledTaskId && item.status !== "launched" && item.status !== "done";
          return (
            <li key={item.id}>
              <div
                className={cn(
                  "rounded-xl border bg-card transition-colors",
                  open ? "border-ring/40 shadow-sm" : "border-border hover:bg-muted/40",
                )}
              >
                <button
                  type="button"
                  className="w-full rounded-xl p-3 text-left focus-visible:outline-2 focus-visible:outline-ring"
                  aria-expanded={open}
                  onClick={() => {
                    setSelectedId(open ? null : item.id);
                    setRunAt("");
                    setEditing(null);
                  }}
                >
                  <span className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {item.title || "Untitled"}
                    </span>
                    <ChevronDownIcon
                      className={cn(
                        "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <Badge variant="outline">{isPrompt ? "Prompt" : "Note"}</Badge>
                    {item.scheduledTaskId ? (
                      <Badge variant="warning">
                        <ClockIcon className="size-3" />
                        Scheduled
                      </Badge>
                    ) : null}
                    {item.pendingCommandId ? <Badge variant="warning">Working</Badge> : null}
                  </span>
                  {open || item.body.trim() === item.title.trim() ? null : (
                    <span className="mt-2 line-clamp-2 block whitespace-pre-wrap text-sm text-muted-foreground">
                      {item.body}
                    </span>
                  )}
                </button>
                {open ? (
                  <section
                    className="space-y-4 border-t border-border px-3 pt-3 pb-3"
                    aria-label="Saved message details"
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <Input
                          aria-label="Message title"
                          placeholder="Title"
                          value={editing.title}
                          onChange={(event) =>
                            setEditing({ ...editing, title: event.target.value })
                          }
                        />
                        <DictationTextarea
                          aria-label="Message text"
                          className="min-h-32"
                          value={editing.body}
                          onChange={(event) => setEditing({ ...editing, body: event.target.value })}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={busy || !props.canOperate || !editing.body.trim()}
                            onClick={saveEdit}
                          >
                            Save changes
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 px-3 py-2 text-sm">
                        {item.body}
                      </p>
                    )}
                    {item.tags.length ? (
                      <p className="flex flex-wrap gap-1.5">
                        {item.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </p>
                    ) : null}
                    <fieldset
                      disabled={busy || !props.canOperate || !!item.pendingCommandId}
                      className="space-y-4"
                    >
                      {isPrompt && item.status === "queued" ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {props.threadId ? (
                              <Button
                                size="sm"
                                disabled={!!item.scheduledTaskId || isEditing}
                                onClick={() => queueInThread(item)}
                              >
                                <ListPlusIcon />
                                Add to waiting messages
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant={props.threadId ? "outline" : "default"}
                              disabled={needsProject(item) || !!item.scheduledTaskId || isEditing}
                              onClick={() =>
                                void act(
                                  `${item.id}:launch`,
                                  async (commandId) =>
                                    unwrap(
                                      await launch({
                                        environmentId: props.environmentId,
                                        input: executionInput(item, commandId),
                                      }),
                                    ),
                                  "Started in a new chat. Open the Started tab to find it.",
                                )
                              }
                            >
                              <PlayIcon />
                              Start in a new chat
                            </Button>
                            {!isEditing ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setEditing({ id: item.id, title: item.title, body: item.body })
                                }
                              >
                                <PencilIcon />
                                Edit
                              </Button>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {props.threadId
                              ? "Waiting messages go out after the AI stops, in the order you add them. "
                              : "Open a chat that has started to add messages to its waiting messages. "}
                            A new chat uses the model and permission from the message box, in the
                            main folder.
                            {needsProject(item) ? " Select a project before you start." : ""}
                          </p>
                          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/70 p-2">
                            <label className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
                              <span>Send once at (your local time)</span>
                              <Input
                                type="datetime-local"
                                value={runAt}
                                onChange={(event) => setRunAt(event.target.value)}
                              />
                            </label>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                !runAt ||
                                !Number.isFinite(new Date(runAt).getTime()) ||
                                !!item.scheduledTaskId ||
                                needsProject(item)
                              }
                              onClick={() =>
                                void act(
                                  `${item.id}:schedule:${runAt}`,
                                  async (commandId) =>
                                    unwrap(
                                      await schedule({
                                        environmentId: props.environmentId,
                                        input: {
                                          ...executionInput(item, commandId),
                                          runAt: new Date(runAt).toISOString(),
                                        },
                                      }),
                                    ),
                                  "Scheduled once",
                                )
                              }
                            >
                              <ClockIcon />
                              Schedule
                            </Button>
                          </div>
                        </div>
                      ) : !isEditing ? (
                        <div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setEditing({ id: item.id, title: item.title, body: item.body })
                            }
                          >
                            <PencilIcon />
                            Edit
                          </Button>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1 border-t border-border/70 pt-3">
                        <Button
                          size="sm"
                          variant="ghost-muted"
                          onClick={() => {
                            void navigator.clipboard.writeText(renderSavedItemMarkdown(item)).then(
                              () => setNotice("Copied Markdown"),
                              (cause) => setError(errorText(cause)),
                            );
                          }}
                        >
                          <CopyIcon />
                          Copy
                        </Button>
                        {item.launchedThreadId ? (
                          <Button
                            size="sm"
                            variant="ghost-muted"
                            onClick={() => {
                              props.close();
                              void navigate({
                                to: "/$environmentId/$threadId",
                                params: {
                                  environmentId: props.environmentId,
                                  threadId: item.launchedThreadId!,
                                },
                              });
                            }}
                          >
                            <ExternalLinkIcon />
                            Open chat
                          </Button>
                        ) : null}
                        {item.scheduledTaskId ? (
                          <Button
                            size="sm"
                            variant="ghost-muted"
                            onClick={() => {
                              props.close();
                              void navigate({
                                to: "/settings/scheduled-tasks",
                                search: { environmentId: props.environmentId },
                              });
                            }}
                          >
                            <ClockIcon />
                            Manage schedule
                          </Button>
                        ) : null}
                        {item.status === "queued" ? (
                          <Button
                            size="sm"
                            variant="ghost-muted"
                            onClick={() =>
                              void act(
                                `${item.id}:task`,
                                async (commandId) =>
                                  unwrap(
                                    await task({
                                      environmentId: props.environmentId,
                                      input: { commandId, id: item.id },
                                    }),
                                  ),
                                "Moved to the task board",
                              )
                            }
                          >
                            Move to the task board
                          </Button>
                        ) : null}
                        <span className="ml-auto flex flex-wrap items-center gap-1">
                          {item.status === "archived" ? (
                            <Button
                              size="sm"
                              variant="ghost-muted"
                              onClick={() => changeStatus(item, "restore")}
                            >
                              <ArchiveRestoreIcon />
                              Restore
                            </Button>
                          ) : (
                            <>
                              {item.status !== "queued" ? (
                                <Button
                                  size="sm"
                                  variant="ghost-muted"
                                  onClick={() => changeStatus(item, "requeue")}
                                >
                                  <RotateCcwIcon />
                                  Requeue
                                </Button>
                              ) : null}
                              {item.status !== "done" ? (
                                <Button
                                  size="sm"
                                  variant="ghost-muted"
                                  onClick={() => changeStatus(item, "done")}
                                >
                                  <CheckIcon />
                                  Mark done
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="ghost-muted"
                                onClick={() => changeStatus(item, "archive")}
                              >
                                <ArchiveIcon />
                                Remove
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost-destructive"
                            disabled={deleteBlocked}
                            title={
                              deleteBlocked
                                ? "Turn off its schedule before you delete it"
                                : "Delete for good"
                            }
                            onClick={() => setConfirmDelete(item)}
                          >
                            <Trash2Icon />
                            Delete
                          </Button>
                        </span>
                      </div>
                      {scheduleOpen ? (
                        <p className="text-xs text-muted-foreground">
                          Removing it does not stop its schedule. Use Manage schedule to turn the
                          schedule off.
                        </p>
                      ) : null}
                    </fieldset>
                  </section>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(next) => {
          if (!next) setConfirmDelete(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirmDelete?.title || "Untitled"}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes it for good. You cannot undo this. Use Remove instead if you may want it
              back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="sm" />}>
              Keep it
            </AlertDialogClose>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => confirmDelete && deleteItem(confirmDelete)}
            >
              Delete for good
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Import saved Markdown</DialogTitle>
            <DialogDescription>
              Paste a message or note you exported. It will be saved in{" "}
              {projectId ? "this project" : "No project"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-6">
            <Textarea
              aria-label="Saved Markdown"
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
            />
            {markdown && !parsed.ok ? (
              <p role="alert" className="text-sm text-destructive">
                {parsed.error}
              </p>
            ) : null}
            {parsed.ok ? (
              <p className="text-sm">
                {parsed.item.title || "Untitled"} · {kindLabel(parsed.item.kind)}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!parsed.ok || busy || !props.canOperate} onClick={importMarkdown}>
              {busy
                ? "Importing…"
                : `Import as ${parsed.ok ? kindLabel(parsed.item.kind) : "saved message"}`}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}

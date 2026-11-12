import type { SubagentCatalogEntry } from "@t3tools/contracts";
import {
  BotIcon,
  CopyIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  subagentDelete,
  subagentDuplicate,
  subagentsCatalogQuery,
  subagentsComposerQuery,
  subagentUpdate,
} from "~/state/subagents";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { workspaceScopeInput } from "~/components/workspace/aiosWorkspace.logic";
import { activeWorkspaceId } from "~/components/workspace/aiosWorkspaceStore";
import { useAtomCommand } from "~/state/use-atom-command";
import { AgentAvatar } from "./Avatar";
import { NewSubagentDialog } from "./NewSubagentDialog";
import { SubagentEditor, writeFailureMessage } from "./SubagentEditor";
import { knownFreeModels } from "./subagentEdit.logic";
import { formatStartCost, modelDisplayName } from "./spawnApproval.logic";
import {
  countReady,
  entryId,
  formatTokensShort,
  entryAvatar,
  groupStudioEntries,
  isLead,
  personaEngineHint,
  type StudioGroupKey,
} from "./subagentStudio.logic";

const EMPTY_GROUP_TEXT: Record<StudioGroupKey, string | null> = {
  lead: null,
  on: "No agent is on. Turn one on from the catalog.",
  catalog: null,
  projects: "No project agents yet. Add one in projects/<name>/.agents/subagents/.",
  fix: null,
};

/**
 * The Team tab (ADR-0082): live KPIs on top, the list grouped Lead, On, Catalog, Projects on
 * the left, and the selected agent's model, tools, never-list and Context List on the right.
 */
export function SubagentStudio() {
  const environmentId = usePrimaryEnvironmentId();
  const { scope, scopeReady } = useActiveAiosWorkspace();
  const catalog = useEnvironmentQuery(
    environmentId && scopeReady ? subagentsCatalogQuery({ environmentId, input: scope }) : null,
  );
  // The composer keeps its own copy of the list; refresh both after a write so the
  // @ menu and the attach tab show the change without a restart.
  const composerCatalog = useEnvironmentQuery(
    environmentId && scopeReady ? subagentsComposerQuery({ environmentId, input: scope }) : null,
  );
  const refreshAll = () => {
    catalog.refresh();
    composerCatalog.refresh();
  };
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const entries = catalog.data?.entries ?? [];
  const groups = useMemo(() => groupStudioEntries(entries, query), [entries, query]);
  const visible = groups.flatMap((group) => group.entries);
  const selected =
    visible.find((entry) => entryId(entry) === selectedId) ??
    groups.find((group) => group.key === "on")?.entries[0] ??
    visible[0] ??
    null;

  return (
    <section aria-labelledby="subagent-studio-title" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="subagent-studio-title"
            className="flex items-center gap-2 text-base font-semibold"
          >
            <BotIcon aria-hidden className="size-4 text-muted-foreground" />
            Team
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Agents that any chat can call. A free-tier model starts at once; a confirm-tier model
            asks you first.
            {catalog.dataUpdatedAt <= 0 ? null : (
              <span className="ms-1 tabular-nums">
                Updated {formatClockTime(catalog.dataUpdatedAt)}.
              </span>
            )}
          </p>
        </div>
        {environmentId === null || catalog.data === null ? null : (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <PlusIcon />
            New agent
          </Button>
        )}
      </div>

      {environmentId === null || catalog.data === null ? null : (
        <NewSubagentDialog
          environmentId={environmentId}
          entries={entries}
          hasAios={catalog.data.aiosRoot !== null}
          open={creating}
          onOpenChange={setCreating}
          onCreated={(entry) => {
            setSelectedId(entryId(entry));
            refreshAll();
          }}
        />
      )}

      {catalog.data === null ? (
        catalog.error === null ? (
          <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner /> Loading agents…
          </div>
        ) : (
          <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm">
            <p className="font-medium">Could not read your agents</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={catalog.refresh}>
              Try again
            </Button>
          </div>
        )
      ) : (
        <>
          <KpiStrip
            ready={countReady(entries)}
            spawnsToday={catalog.data.stats.spawnsToday}
            waitedToday={catalog.data.stats.waitedToday}
            meanStartTokens={catalog.data.stats.meanStartTokensToday}
            estimatedStart={meanEstimate(entries)}
          />
          <div className="grid min-h-[26rem] overflow-hidden rounded-lg border border-border md:grid-cols-[17rem_minmax(0,1fr)]">
            <nav
              aria-label="Agents"
              className="flex min-w-0 flex-col border-b border-border md:border-r md:border-b-0"
            >
              <div className="relative border-b border-border p-2">
                <InputGroup>
                  <InputGroupAddon>
                    <SearchIcon aria-hidden />
                  </InputGroupAddon>
                  <InputGroupInput
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search agents"
                    aria-label="Search agents"
                  />
                </InputGroup>
              </div>
              <div className="flex max-h-[22rem] flex-col gap-3 overflow-y-auto p-2 md:max-h-none">
                {groups.map((group) => {
                  const emptyText = EMPTY_GROUP_TEXT[group.key];
                  if (group.entries.length === 0 && (emptyText === null || query.length > 0)) {
                    return null;
                  }
                  return (
                    <div key={group.key} role="group" aria-labelledby={`studio-group-${group.key}`}>
                      <h3
                        id={`studio-group-${group.key}`}
                        className="px-2 pb-1 text-xs font-medium text-muted-foreground"
                      >
                        {group.title} ({group.entries.length})
                      </h3>
                      {group.entries.length === 0 ? (
                        <p className="px-2 text-xs text-muted-foreground">{emptyText}</p>
                      ) : (
                        <ul className="flex flex-col gap-0.5">
                          {group.entries.map((entry) => (
                            <li key={entryId(entry)}>
                              <StudioListItem
                                entry={entry}
                                selected={selected !== null && entryId(selected) === entryId(entry)}
                                onSelect={() => setSelectedId(entryId(entry))}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
                {visible.length === 0 && query.length > 0 ? (
                  <p className="px-2 text-xs text-muted-foreground">No agent matches.</p>
                ) : null}
              </div>
            </nav>
            <div className="min-w-0 p-5">
              {selected === null ? (
                <p className="text-sm text-muted-foreground">
                  {catalog.data.aiosRoot === null
                    ? "Connect your AIOS folder on Home to list its agents."
                    : "No agents yet. Create one, or import a starter."}
                </p>
              ) : (
                <SubagentDetail
                  key={entryId(selected)}
                  entry={selected}
                  environmentId={environmentId}
                  knownFree={knownFreeModels(entries)}
                  onChanged={refreshAll}
                />
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/** "7:41 PM": 12-hour clock with AM or PM. */
const formatClockTime = (at: number) =>
  new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function meanEstimate(entries: ReadonlyArray<SubagentCatalogEntry>): number | null {
  const ready = entries.filter(
    (entry) => entry.enabled && entry.error === null && entry.estimatedStartTokens !== null,
  );
  if (ready.length === 0) return null;
  return Math.round(
    ready.reduce((sum, entry) => sum + (entry.estimatedStartTokens ?? 0), 0) / ready.length,
  );
}

function KpiStrip(props: {
  readonly ready: number;
  readonly spawnsToday: number;
  readonly waitedToday: number;
  readonly meanStartTokens: number | null;
  readonly estimatedStart: number | null;
}) {
  const tokens = props.meanStartTokens ?? props.estimatedStart;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Kpi
        value={String(props.ready)}
        label="on, ready to spawn"
        tip="Helpers that are on and whose spec resolves, so a chat can start them now."
      />
      <Kpi
        value={String(props.spawnsToday)}
        label="spawns today"
        tip="Helper starts made in this app since midnight. The count is kept when the app restarts."
      />
      <Kpi
        value={String(props.waitedToday)}
        label="waited for your approval"
        tip="Confirm-tier spawns that showed you a card today."
      />
      <Kpi
        value={tokens === null ? "–" : formatTokensShort(tokens)}
        label="tokens per lean start"
        tip={
          props.meanStartTokens === null
            ? "No spawn yet today. This is the mean estimate for the helpers that are on."
            : "Mean estimated start tokens of today's spawns."
        }
      />
    </dl>
  );
}

function Kpi(props: { readonly value: string; readonly label: string; readonly tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            tabIndex={0}
            className="flex flex-col justify-start rounded-lg border border-border px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
        }
      >
        <dt className="text-xs text-muted-foreground">{props.label}</dt>
        <dd className="order-first text-2xl font-semibold tabular-nums">{props.value}</dd>
      </TooltipTrigger>
      <TooltipPopup className="max-w-64">{props.tip}</TooltipPopup>
    </Tooltip>
  );
}

const TIER_TIPS = {
  fix: "This spec does not resolve, so it cannot start. Open the file and fix the error shown.",
  free: "Free tier: starts at once with no card.",
  confirm: "Confirm tier: shows you a card with the model and start cost before it starts.",
} as const;

function TierBadge({ entry }: { readonly entry: SubagentCatalogEntry }) {
  const kind =
    entry.legacy || entry.error !== null ? "fix" : entry.tier === "free" ? "free" : "confirm";
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
        <TierBadgeLabel kind={kind} />
      </TooltipTrigger>
      <TooltipPopup className="max-w-64">{TIER_TIPS[kind]}</TooltipPopup>
    </Tooltip>
  );
}

function TierBadgeLabel({ kind }: { readonly kind: keyof typeof TIER_TIPS }) {
  if (kind === "fix") {
    return (
      <Badge variant="error" size="sm">
        <TriangleAlertIcon aria-hidden />
        Fix
      </Badge>
    );
  }
  if (kind === "free") {
    return (
      <Badge variant="success" size="sm">
        Free
      </Badge>
    );
  }
  return (
    <Badge variant="warning" size="sm">
      Confirm
    </Badge>
  );
}

function StudioListItem(props: {
  readonly entry: SubagentCatalogEntry;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const { entry } = props;
  return (
    <button
      type="button"
      onClick={props.onSelect}
      aria-current={props.selected ? "true" : undefined}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        props.selected && "bg-accent",
      )}
    >
      <AgentAvatar avatar={entryAvatar(entry)} name={entry.name} size={36} />
      <span className="min-w-0 flex-1">
        <Tooltip>
          <TooltipTrigger render={<span className="block truncate" />}>{entry.name}</TooltipTrigger>
          <TooltipPopup>{entry.name}</TooltipPopup>
        </Tooltip>
        {entry.description === null ? null : (
          <span className="block truncate text-xs text-muted-foreground">{entry.description}</span>
        )}
        {entry.projectName === null ? null : (
          <span className="block truncate text-xs text-muted-foreground">{entry.projectName}</span>
        )}
      </span>
      <TierBadge entry={entry} />
    </button>
  );
}

function DetailRow(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="min-w-0">{props.children}</dd>
    </>
  );
}

function SubagentDetail({
  entry,
  environmentId,
  knownFree,
  onChanged,
}: {
  readonly entry: SubagentCatalogEntry;
  readonly environmentId: EnvironmentId | null;
  readonly knownFree: ReadonlySet<string>;
  readonly onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const update = useAtomCommand(subagentUpdate, { reportFailure: false });
  const duplicate = useAtomCommand(subagentDuplicate, { reportFailure: false });
  const remove = useAtomCommand(subagentDelete, { reportFailure: false });
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [working, setWorking] = useState(false);
  const canWrite = environmentId !== null && !entry.legacy;

  // Duplicate and Delete take the same scope input as Edit. A failure shows in the toggle banner.
  const runWrite = async (kind: "duplicate" | "delete") => {
    if (environmentId === null || working) return;
    setWorking(true);
    setToggleError(null);
    const input = {
      ...workspaceScopeInput(activeWorkspaceId(environmentId)),
      specPath: entry.specPath,
    };
    const result =
      kind === "duplicate"
        ? await duplicate({ environmentId, input })
        : await remove({ environmentId, input });
    setWorking(false);
    setConfirmingDelete(false);
    if (result._tag === "Success") return onChanged();
    if (isAtomCommandInterrupted(result)) return;
    setToggleError(
      writeFailureMessage(
        squashAtomCommandFailure(result),
        kind === "duplicate"
          ? "The copy was not made. Try again."
          : "It was not deleted. Try again.",
      ),
    );
  };

  const setEnabled = async (enabled: boolean) => {
    if (environmentId === null || toggling) return;
    setToggling(true);
    setToggleError(null);
    const result = await update({
      environmentId,
      input: {
        ...workspaceScopeInput(activeWorkspaceId(environmentId)),
        specPath: entry.specPath,
        patch: { enabled },
      },
    });
    setToggling(false);
    if (result._tag === "Success") return onChanged();
    if (isAtomCommandInterrupted(result)) return;
    setToggleError(
      writeFailureMessage(squashAtomCommandFailure(result), "The switch did not save. Try again."),
    );
  };

  const contextTotal = entry.context.reduce((sum, item) => sum + (item.tokens ?? 0), 0);
  return (
    <article aria-labelledby="studio-detail-title" className="flex flex-col gap-4">
      <header className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <AgentAvatar avatar={entryAvatar(entry)} name={entry.name} size={56} />
          <Tooltip>
            <TooltipTrigger
              render={
                <h3
                  id="studio-detail-title"
                  className="min-w-0 truncate text-lg font-semibold"
                  tabIndex={0}
                />
              }
            >
              {entry.name}
            </TooltipTrigger>
            <TooltipPopup>{entry.name}</TooltipPopup>
          </Tooltip>
          <TierBadge entry={entry} />
          {isLead(entry) ? (
            <Badge variant="info" size="sm">
              Lead · starts other agents
            </Badge>
          ) : null}
          {entry.enabled ? null : (
            <Badge variant="secondary" size="sm">
              Off
            </Badge>
          )}
          {canWrite ? (
            <div className="ms-auto flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  size="sm"
                  checked={entry.enabled}
                  disabled={toggling}
                  onCheckedChange={(checked) => void setEnabled(checked)}
                  aria-label={`${entry.name} on`}
                />
                On
              </label>
              {editing ? null : (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    <PencilIcon />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working}
                    onClick={() => void runWrite("duplicate")}
                  >
                    <CopyIcon />
                    Duplicate
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive-outline"
                    disabled={working}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2Icon />
                    Delete
                  </Button>
                </>
              )}
            </div>
          ) : null}
        </div>
        {toggleError === null ? null : (
          <p role="alert" className="mt-2 rounded-md bg-destructive/8 px-3 py-2 text-sm">
            {toggleError}
          </p>
        )}
        {entry.description === null ? null : (
          <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
        )}
        {entry.extends === null ? null : (
          <p className="mt-1 text-xs text-muted-foreground">Extends {entry.extends}</p>
        )}
      </header>

      {entry.error === null ? null : (
        <p role="alert" className="rounded-md bg-destructive/8 px-3 py-2 text-sm">
          {entry.error}
        </p>
      )}

      {editing && environmentId !== null ? (
        <SubagentEditor
          environmentId={environmentId}
          entry={entry}
          knownFree={knownFree}
          onDone={() => {
            setEditing(false);
            onChanged();
          }}
        />
      ) : (
        <>
          <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
            <DetailRow label="Model">
              {entry.model === null ? "Not set" : modelDisplayName(entry.model)}
              {personaEngineHint(entry.model) === null ? null : (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {personaEngineHint(entry.model)}
                </span>
              )}
            </DetailRow>
            <DetailRow label="Account">
              {entry.account === null ? "Balanced (the app picks)" : entry.account}
            </DetailRow>
            {entry.effort == null ? null : <DetailRow label="Effort">{entry.effort}</DetailRow>}
            {entry.maxTurns == null ? null : (
              <DetailRow label="Max turns">{entry.maxTurns}</DetailRow>
            )}
            {isLead(entry) ? <DetailRow label="Children">Up to 3 at once</DetailRow> : null}
            {(entry.skills ?? []).length === 0 ? null : (
              <DetailRow label="Skills">
                <ul className="flex flex-wrap gap-1">
                  {(entry.skills ?? []).map((skill) => (
                    <li key={skill}>
                      <Badge variant="outline" size="sm">
                        {skill}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </DetailRow>
            )}
            <DetailRow label="Tools">
              {entry.tools.length === 0 ? (
                <span className="text-muted-foreground">None</span>
              ) : (
                <ul className="flex flex-wrap gap-1">
                  {entry.tools.map((tool) => (
                    <li key={tool}>
                      <Badge variant="outline" size="sm">
                        {tool.replace("mcp__leonidas__", "")}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </DetailRow>
            <DetailRow label="Never">
              {entry.never.length === 0 ? (
                <span className="text-muted-foreground">No rules</span>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {entry.never.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              )}
            </DetailRow>
          </dl>

          {entry.instructions === undefined || entry.instructions === "" ? null : (
            <section aria-label="Instructions" className="rounded-lg border border-border">
              <h4 className="border-b border-border px-3 py-2 text-sm font-medium">Instructions</h4>
              <p className="max-h-48 overflow-y-auto px-3 py-2 text-sm whitespace-pre-wrap text-muted-foreground">
                {entry.instructions}
              </p>
            </section>
          )}

          <div className="rounded-lg border border-border">
            <div className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2">
              <h4 className="text-sm font-medium">Context List</h4>
              <span className="text-xs text-muted-foreground tabular-nums">
                {entry.estimatedStartTokens === null
                  ? "Start cost unknown"
                  : `${formatStartCost(entry.estimatedStartTokens)} to start`}
              </span>
            </div>
            {entry.context.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                Persona only. No files load with it.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {entry.context.map((item) => (
                  <li key={item.path} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            className="min-w-0 flex-1 truncate font-mono text-xs"
                            tabIndex={0}
                          />
                        }
                      >
                        {item.path}
                      </TooltipTrigger>
                      <TooltipPopup>{item.path}</TooltipPopup>
                    </Tooltip>
                    <span
                      className={cn(
                        "shrink-0 text-xs tabular-nums",
                        item.tokens === null
                          ? "text-destructive-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {item.tokens === null ? "missing" : item.tokens.toLocaleString("en-US")}
                    </span>
                  </li>
                ))}
                <li className="flex items-center gap-3 px-3 py-1.5 text-xs text-muted-foreground">
                  <span className="flex-1">Files total</span>
                  <span className="tabular-nums">{contextTotal.toLocaleString("en-US")}</span>
                </li>
              </ul>
            )}
          </div>
        </>
      )}

      <Tooltip>
        <TooltipTrigger
          render={<p className="truncate font-mono text-xs text-muted-foreground" tabIndex={0} />}
        >
          {entry.specPath}
        </TooltipTrigger>
        <TooltipPopup>{entry.specPath}</TooltipPopup>
      </Tooltip>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {entry.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the file {entry.specPath}. You cannot undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="sm" />}>
              Keep it
            </AlertDialogClose>
            <Button
              size="sm"
              variant="destructive"
              disabled={working}
              onClick={() => void runWrite("delete")}
            >
              Delete for good
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </article>
  );
}

import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { AiosDirection, AiosDirectionHorizon } from "@t3tools/contracts";
import { ChevronRightIcon, ClipboardCheckIcon, FlagIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { useComposerDraftStore } from "~/composerDraftStore";
import { useHandleNewThread } from "~/hooks/useHandleNewThread";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useProjects } from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { aiosDirectionQuery } from "~/state/taskBoard";
import { cn } from "~/lib/utils";

import {
  horizonPreview,
  isDirectionEmpty,
  placeReplanPrompt,
  replanPrompt,
  staleMessage,
} from "./direction.logic";

const sameFolder = (a: string, b: string) =>
  a
    .replace(/[\\/]+$/, "")
    .replace(/\\/g, "/")
    .toLowerCase() ===
  b
    .replace(/[\\/]+$/, "")
    .replace(/\\/g, "/")
    .toLowerCase();

/** Copies a prompt and puts it in a new chat box, with a plain notice about what happened. */
export function usePlacePrompt() {
  const { active } = useActiveAiosWorkspace();
  const projects = useProjects();
  const { handleNewThread, defaultProjectRef } = useHandleNewThread();
  const [notice, setNotice] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  const place = useCallback(
    async (prompt: string) => {
      const project = active
        ? projects.find((candidate) => sameFolder(candidate.workspaceRoot, active.root))
        : undefined;
      const projectRef = project
        ? scopeProjectRef(project.environmentId, project.id)
        : defaultProjectRef;
      const result = await placeReplanPrompt(
        {
          writeClipboard: (text) => navigator.clipboard.writeText(text),
          openDraft: async () => {
            if (projectRef === null) return null;
            const opened = await handleNewThread(projectRef);
            if (!opened) return null;
            return {
              setPrompt: (text) => useComposerDraftStore.getState().setPrompt(opened.draftId, text),
            };
          },
        },
        prompt,
      );
      setFallbackText(result.placed || result.copied ? null : prompt);
      setNotice(
        result.placed
          ? result.copied
            ? "Prompt copied and placed in the chat box. Read it, then send it."
            : "Prompt placed in the chat box. Read it, then send it."
          : result.copied
            ? "Prompt copied. Open a chat and paste it."
            : "Copy the prompt below into a chat.",
      );
    },
    [active, defaultProjectRef, handleNewThread, projects],
  );

  return { place, notice, fallbackText };
}

function useReplan(direction: AiosDirection | null) {
  const { place, notice, fallbackText } = usePlacePrompt();
  const replan = useCallback(async () => {
    if (direction !== null) await place(replanPrompt(direction));
  }, [direction, place]);
  return { replan, notice, fallbackText };
}

function HorizonRow({ horizon }: { horizon: AiosDirectionHorizon }) {
  const open = horizon.key === "week";
  return (
    <details open={open} className="group rounded-md border border-border">
      <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2 focus-visible:outline-2 focus-visible:outline-foreground/30">
        <ChevronRightIcon
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold">{horizon.title}</span>
            {horizon.range ? (
              <span className="text-xs text-muted-foreground">{horizon.range}</span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground group-open:hidden">
            {horizonPreview(horizon.items)}
          </span>
        </span>
      </summary>
      <div className="px-3 pb-3 pl-9">
        {horizon.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing planned yet.</p>
        ) : (
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm marker:text-muted-foreground">
            {horizon.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        {horizon.cards.length > 0 ? (
          <div className="mt-3">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Top cards
            </h4>
            <ul className="mt-1 flex flex-col gap-1">
              {horizon.cards.map((card) => (
                <li key={card.taskId} className="flex items-baseline gap-2 text-sm">
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium",
                      card.priority === "critical"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {card.priority === "critical" ? "Critical" : "High"}
                  </span>
                  <span className="min-w-0 truncate">{card.title}</span>
                  {card.due ? (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {card.due}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}

/**
 * The Direction view: goals with dates, the 5 horizons and a re-plan prompt. Reads files only.
 * `bare` drops the frame so Goal progress can hold it.
 */
export function DirectionSection({ bare = false }: { bare?: boolean }) {
  const environmentId = usePrimaryEnvironmentId();
  const { scope, scopeReady } = useActiveAiosWorkspace();
  const query = useEnvironmentQuery(
    environmentId && scopeReady ? aiosDirectionQuery({ environmentId, input: scope }) : null,
  );
  const { data, error, refresh } = query;
  const { replan, notice, fallbackText } = useReplan(data);
  const stale = useMemo(() => (data ? staleMessage(data) : null), [data]);

  if (data === null && error !== null) {
    return (
      <section role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm">
        <p className="font-medium">Could not read your direction</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={refresh}>
          <RefreshCwIcon aria-hidden /> Try again
        </Button>
      </section>
    );
  }
  if (data === null) {
    return (
      <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Spinner /> Reading your direction...
      </div>
    );
  }
  if (data.root === null) return null;

  const empty = isDirectionEmpty(data);
  return (
    <section
      aria-labelledby="direction-title"
      className={cn(!bare && "rounded-lg border border-border p-5")}
    >
      <div className="flex items-start gap-3">
        <FlagIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 id="direction-title" className="text-base font-semibold">
            Goals and plan
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {empty
              ? "Your AIOS has no goals yet. A 10-minute grill sets them."
              : "Your goals, and what you plan for each time span."}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={replan}>
          <ClipboardCheckIcon aria-hidden /> {empty ? "Set my direction" : "Re-plan"}
        </Button>
      </div>

      {notice ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {fallbackText ? (
        <textarea
          readOnly
          aria-label="Re-plan prompt"
          value={fallbackText}
          rows={6}
          className="mt-2 w-full rounded-md border border-border bg-muted/30 p-2 text-xs"
        />
      ) : null}

      {stale && !empty ? (
        <p role="status" className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          {stale}
        </p>
      ) : null}

      {data.goals.length > 0 ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {data.goals.map((goal) => (
            <li key={goal.id} className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">
                {goal.id}
                {goal.targetDate ? ` · ${goal.targetDate}` : ""}
              </p>
              <p className="mt-0.5 text-sm font-medium">{goal.goal}</p>
              {goal.status ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{goal.status}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {empty ? null : (
        <div className="mt-4 flex flex-col gap-2">
          {data.horizons.map((horizon) => (
            <HorizonRow key={horizon.key} horizon={horizon} />
          ))}
        </div>
      )}
    </section>
  );
}

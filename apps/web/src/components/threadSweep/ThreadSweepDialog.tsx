import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectId, ThreadId, ThreadSweepResult } from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useThreadActions } from "../../hooks/useThreadActions";
import { threadHandoffQuery, threadSweepQuery } from "../../state/threadSweep";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import { buildThreadRouteParams } from "../../threadRoutes";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Spinner } from "../ui/spinner";
import { HandoffPanel } from "./HandoffPanel";
import {
  CLASS_HINT,
  CLASS_LABEL,
  CLASS_ORDER,
  DEFAULT_IDLE,
  IDLE_OPTIONS,
  groupSweepItems,
  handoffStateFromResult,
  idleMinutes,
  initialSelection,
  sourceLabel,
  sweepNotices,
  sweepSummary,
  toggleSelection,
  withoutThreads,
  type HandoffState,
  type IdleOptionId,
} from "./threadSweep.logic";

/** One finished request. `key` says which idle choice and try it answers. */
interface Loaded {
  readonly key: string;
  readonly result: ThreadSweepResult | null;
}

/** Review old chats: the AI model sorts idle chats into keep, archive and hand off. */
export function ThreadSweepDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly onClose: () => void;
}) {
  const { environmentId, cwd, onClose } = props;
  const router = useRouter();
  const { archiveThread } = useThreadActions();
  const handleNewThread = useNewThreadHandler();
  const runHandoff = useAtomQueryRunner(threadHandoffQuery, {
    reportFailure: false,
    reportDefect: false,
    refresh: true,
  });
  const [handoffs, setHandoffs] = useState<Readonly<Record<string, HandoffState>>>({});
  const run = useAtomQueryRunner(threadSweepQuery, {
    reportFailure: false,
    reportDefect: false,
    refresh: true,
  });
  const [idle, setIdle] = useState<IdleOptionId>(DEFAULT_IDLE);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [archiving, setArchiving] = useState(false);
  const [archiveNote, setArchiveNote] = useState<string | null>(null);

  const key = `${idle}:${attempt}`;
  // Derived, so a new choice shows "loading" without setting state inside the effect.
  const phase = loaded?.key !== key ? "loading" : loaded.result === null ? "error" : "ready";
  const result = phase === "ready" ? (loaded?.result ?? null) : null;

  useEffect(() => {
    let current = true;
    void run({ environmentId, input: { cwd, idleMinutes: idleMinutes(idle) } }).then((response) => {
      if (!current) return; // a newer choice replaced this request
      const value = response._tag === "Success" ? response.value : null;
      setLoaded({ key, result: value });
      setSelected(value ? initialSelection(value.items) : new Set());
    });
    return () => {
      current = false;
    };
  }, [cwd, environmentId, idle, key, run]);

  const groups = result ? groupSweepItems(result.items) : null;
  const picked = groups ? groups.done.filter((item) => selected.has(item.threadId)) : [];

  const choose = (next: IdleOptionId) => {
    setArchiveNote(null);
    setIdle(next);
  };

  const archivePicked = async () => {
    if (!result || picked.length === 0) return;
    setArchiving(true);
    const archived = new Set<string>();
    for (const item of picked) {
      const outcome = await archiveThread(scopeThreadRef(environmentId, item.threadId));
      if (outcome._tag === "Success") archived.add(item.threadId);
    }
    setLoaded((current) =>
      current?.result
        ? {
            ...current,
            result: { ...current.result, items: withoutThreads(current.result.items, archived) },
          }
        : current,
    );
    setSelected((current) => new Set([...current].filter((id) => !archived.has(id))));
    setArchiveNote(
      archived.size === picked.length
        ? `Archived ${archived.size} chat${archived.size === 1 ? "" : "s"}. Use Undo in the sidebar to bring one back.`
        : `Archived ${archived.size} of ${picked.length}. The rest could not be archived.`,
    );
    setArchiving(false);
  };

  const writeHandoff = async (threadId: ThreadId) => {
    setHandoffs((current) => ({ ...current, [threadId]: { status: "loading" } }));
    const response = await runHandoff({ environmentId, input: { cwd, threadId } });
    const state = handoffStateFromResult(response._tag === "Success" ? response.value : null);
    setHandoffs((current) => ({ ...current, [threadId]: state }));
  };

  // Opens a new chat in the same project with the prompt in the composer. Nothing is sent.
  const continueInNewChat = async (projectId: ProjectId, prompt: string) => {
    const created = await handleNewThread(scopeProjectRef(environmentId, projectId));
    if (!created) return;
    useComposerDraftStore.getState().setPrompt(created.draftId, prompt);
    onClose();
  };

  const openThread = (threadId: ThreadId) => {
    onClose();
    void router.navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId, threadId)),
    });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogPopup className="max-w-2xl" bottomStickOnMobile={false}>
        <DialogHeader>
          <DialogTitle>Review old chats</DialogTitle>
          <DialogDescription>
            Sorts chats that are not running. It changes nothing until you click Archive.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="max-h-[60dvh]">
          <div
            role="group"
            aria-label="Only chats idle for at least"
            className="mb-3 flex items-center gap-2"
          >
            <span className="text-sm text-muted-foreground">Idle for at least</span>
            {IDLE_OPTIONS.map((option) => (
              <Button
                key={option.id}
                size="xs"
                variant={idle === option.id ? "default" : "outline"}
                aria-pressed={idle === option.id}
                onClick={() => choose(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {phase === "loading" ? (
            <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Spinner size="sm" /> Reading your chats...
            </p>
          ) : null}

          {phase === "error" ? (
            <div role="alert" className="py-6 text-sm">
              <p>The sweep could not run. Try again.</p>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                onClick={() => setAttempt((count) => count + 1)}
              >
                Try again
              </Button>
            </div>
          ) : null}

          {result && groups ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-medium" aria-live="polite">
                {sweepSummary(result.items)}
              </p>
              {sweepNotices(result).map((notice) => (
                <p key={notice} className="text-xs text-muted-foreground">
                  {notice}
                </p>
              ))}
              {archiveNote ? (
                <p role="status" className="text-xs text-muted-foreground">
                  {archiveNote}
                </p>
              ) : null}
              {CLASS_ORDER.map((id) =>
                groups[id].length === 0 ? null : (
                  <section key={id} aria-labelledby={`sweep-${id}`}>
                    <h3 id={`sweep-${id}`} className="text-sm font-semibold">
                      {CLASS_LABEL[id]} ({groups[id].length})
                    </h3>
                    <p className="mb-1 text-xs text-muted-foreground">{CLASS_HINT[id]}</p>
                    <ul className="flex flex-col">
                      {groups[id].map((item) => (
                        <li key={item.threadId} className="rounded-md px-1 py-1.5 hover:bg-accent">
                          <div className="flex items-center gap-2">
                            {id === "done" ? (
                              <Checkbox
                                aria-label={`Archive ${item.title}`}
                                checked={selected.has(item.threadId)}
                                onCheckedChange={() =>
                                  setSelected((current) => toggleSelection(current, item.threadId))
                                }
                              />
                            ) : null}
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => openThread(item.threadId)}
                            >
                              <span className="block truncate text-sm">{item.title}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {formatRelativeTimeLabel(item.updatedAt)} ·{" "}
                                {sourceLabel(item.source)}: {item.reason}
                              </span>
                            </button>
                            {id !== "done" && handoffs[item.threadId] === undefined ? (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => void writeHandoff(item.threadId)}
                              >
                                Handoff
                              </Button>
                            ) : null}
                          </div>
                          {handoffs[item.threadId] ? (
                            <HandoffPanel
                              title={item.title}
                              state={handoffs[item.threadId]!}
                              onRetry={() => void writeHandoff(item.threadId)}
                              onContinue={(prompt) =>
                                void continueInNewChat(item.projectId, prompt)
                              }
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ),
              )}
            </div>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={picked.length === 0 || archiving || phase !== "ready"}
            onClick={() => void archivePicked()}
          >
            {archiving ? "Archiving..." : `Archive ${picked.length} selected`}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

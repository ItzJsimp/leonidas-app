import type {
  ContentHistoryResult,
  ContentListResult,
  ContentProposal,
  ContentStage,
  ContentVideo,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { Link } from "@tanstack/react-router";
import { AsyncResult } from "effect/reactivity";
import { ClapperboardIcon } from "lucide-react";
import { type ReactElement, useMemo, useState } from "react";

import { WindowEmpty, WindowLoading } from "~/components/twoState/RailWindow";
import { WindowHeader } from "~/components/twoState/WindowHeader";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { SidebarInset } from "~/components/ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

import { useAtomCommand } from "../../state/use-atom-command";

import { Board, refOf } from "./Board";
import { type CreateDealFn, NewDealButton } from "./NewDealDialog";
import { type PairingAcceptFn, type PairingStartFn, PairComputer } from "./PairComputer";
import { type DecideDealFn, ProposedDeals } from "./ProposedDeals";
import { type SyncFn, SyncButton, syncMessage } from "./SyncButton";
import { ALL_DEALS, boardRows, filmNext, formatDue, type Row } from "./content.logic";
import {
  contentCreateDeal,
  contentDecideDeal,
  contentHistory,
  contentMove,
  contentPairingAccept,
  contentPairingStart,
  contentSaveScript,
  contentSync,
  useContent,
} from "./state";
import { VideoPanel } from "./VideoPanel";

/** One thing a person does to a video. */
export type ContentAction =
  | {
      readonly kind: "move";
      readonly deal: string;
      readonly file: string;
      readonly to: ContentStage;
      readonly note?: string;
    }
  | {
      readonly kind: "script";
      readonly deal: string;
      readonly file: string;
      readonly script: string;
    };

/** Runs one action. Gives the saved video, or the message to show when it failed. */
export type ActFn = (action: ContentAction) => Promise<ContentVideo | string>;
export type LoadHistoryFn = (ref: {
  readonly deal: string;
  readonly file: string;
}) => Promise<ContentHistoryResult | null>;

const formatTime = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** Every control explains itself: what it does and what happens next. */
function Tip(props: { readonly label: string; readonly children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={props.children} />
      <TooltipPopup side="top">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

function DealFilter(props: {
  readonly list: ContentListResult;
  readonly value: string;
  readonly onChange: (deal: string) => void;
}) {
  const options = [
    { value: ALL_DEALS, label: "All deals" },
    ...props.list.deals.map((deal) => ({ value: deal.slug, label: deal.brand })),
  ];
  const current = options.find((option) => option.value === props.value) ?? options[0]!;
  return (
    <Select
      value={current.value}
      onValueChange={(value) => {
        if (typeof value === "string") props.onChange(value);
      }}
    >
      <SelectTrigger size="xs" className="w-44" aria-label="Deal">
        <SelectValue>{current.label}</SelectValue>
      </SelectTrigger>
      <SelectPopup>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

function FilmNext(props: {
  readonly row: Row | null;
  readonly canAct: boolean;
  readonly onOpen: (video: ContentVideo) => void;
  readonly onFilmed: (video: ContentVideo) => void;
}) {
  if (!props.row) {
    return (
      <section
        aria-label="Film next"
        className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground"
      >
        Nothing is ready to film. A video shows here when a person approves its script.
      </section>
    );
  }
  const { video, brand } = props.row;
  const facts = [
    `Film next for ${brand}`,
    formatDue(video.due) ? `due ${formatDue(video.due)}` : null,
    video.lengthS ? `${video.lengthS} s` : null,
    video.approvedBy ? `approved by ${video.approvedBy}` : null,
  ].filter(Boolean);
  return (
    <section
      aria-label="Film next"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs/5 sm:flex-row sm:items-center sm:p-5"
    >
      <ClapperboardIcon aria-hidden className="hidden size-8 shrink-0 text-primary sm:block" />
      <div className="min-w-0 flex-1">
        <h2 className="text-balance font-semibold text-lg leading-snug">{video.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{facts.join(" · ")}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Tip label="Open the script, the shot list and the notes">
          <Button size="sm" onClick={() => props.onOpen(video)}>
            Open script
          </Button>
        </Tip>
        <Tip
          label={
            props.canAct
              ? "Move this video to Filmed. You can undo it."
              : "Only a signed-in person can mark a video filmed"
          }
        >
          <Button
            size="sm"
            variant="outline"
            disabled={!props.canAct}
            onClick={() => props.onFilmed(video)}
          >
            Mark filmed
          </Button>
        </Tip>
      </div>
    </section>
  );
}

/** The Content screen: every video of every deal by stage, with the next one to film on top. */
export function ContentScreen(props: {
  readonly list: ContentListResult | null;
  readonly error: string | null;
  readonly noWorkspace?: boolean;
  readonly updatedAt?: number;
  readonly canAct: boolean;
  readonly act: ActFn;
  readonly loadHistory: LoadHistoryFn;
  readonly createDeal: CreateDealFn;
  readonly decideDeal: DecideDealFn;
  readonly sync: SyncFn;
  readonly pairingStart: PairingStartFn;
  readonly pairingAccept: PairingAcceptFn;
  readonly onRefresh: () => void;
  /** The deal the filter starts on. */
  readonly initialDeal?: string;
}) {
  const { list, error } = props;
  const [deal, setDeal] = useState(props.initialDeal ?? ALL_DEALS);
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(() => (list ? boardRows(list, deal) : []), [list, deal]);
  const next = filmNext(rows);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undo, setUndo] = useState<{
    readonly label: string;
    readonly action: ContentAction;
  } | null>(null);
  const open = (video: ContentVideo) => setSelected(refOf(video));
  const current = rows.find((row) => refOf(row.video) === selected) ?? null;

  /** Runs one action. A move that a person may regret leaves an Undo that moves it back. */
  const run = async (action: ContentAction, undoLabel?: string, back?: ContentStage) => {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    const result = await props.act(action);
    setBusy(false);
    if (typeof result === "string") {
      setProblem(result);
      return;
    }
    setUndo(
      undoLabel && back
        ? {
            label: undoLabel,
            action: { kind: "move", deal: action.deal, file: action.file, to: back },
          }
        : null,
    );
    props.onRefresh();
  };
  const DONE: Partial<Record<ContentStage, string>> = {
    ready_to_film: "Approved.",
    filmed: "Marked filmed.",
    scripting: "Sent back to Scripting.",
  };
  const move = (video: ContentVideo, to: ContentStage, note?: string) =>
    void run(
      { kind: "move", deal: video.deal, file: video.file, to, ...(note ? { note } : {}) },
      DONE[to],
      video.stage,
    );
  const markFilmed = (video: ContentVideo) => move(video, "filmed");
  const decide = async (proposal: ContentProposal, decision: "confirm" | "dismiss") => {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    const refused = await props.decideDeal(proposal.slug, decision);
    setBusy(false);
    if (refused !== null) {
      setProblem(refused);
      return;
    }
    if (decision === "confirm") setNotice(`Started ${proposal.brand}.`);
    props.onRefresh();
  };
  const runSync = async () => {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    const result = await props.sync();
    setBusy(false);
    if (typeof result === "string") {
      setProblem(result);
      return;
    }
    const { ok, text } = syncMessage(result);
    (ok ? setNotice : setProblem)(text);
    props.onRefresh();
  };

  const body = props.noWorkspace ? (
    <p role="status" className="text-sm text-muted-foreground">
      Content reads the deals folder of your AIOS. Connect your AIOS folder on the{" "}
      <Link to="/tasks" className="text-primary underline underline-offset-4">
        Tasks page
      </Link>
      , then come back.
    </p>
  ) : list === null ? (
    error ? (
      <p role="status" className="text-sm text-muted-foreground">
        Content is not available now. Try again later.
      </p>
    ) : (
      <WindowLoading label="Loading deals" />
    )
  ) : list.deals.length === 0 ? (
    <WindowEmpty
      icon={ClapperboardIcon}
      title="No deals yet"
      line="A deal shows here when it has its own folder in deals/ with a deal.md card."
    />
  ) : (
    <>
      <FilmNext row={next} canAct={props.canAct} onOpen={open} onFilmed={markFilmed} />
      <Board rows={rows} selected={selected} onOpen={open} />
      {current ? (
        <VideoPanel
          key={refOf(current.video)}
          video={current.video}
          brand={current.brand}
          canAct={props.canAct}
          busy={busy}
          onMove={(to, note) => move(current.video, to, note)}
          onSave={(action) => void run(action)}
          loadHistory={props.loadHistory}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );

  return (
    <SidebarInset className="isolate h-full min-h-0 overflow-hidden overscroll-y-none">
      <WindowHeader
        title="Content"
        {...(list ? { count: rows.length } : {})}
        actions={
          list && (props.canAct || list.deals.length > 1) ? (
            <div className="flex items-center gap-2">
              {props.canAct ? (
                <>
                  <SyncButton busy={busy} onSync={() => void runSync()} />
                  <NewDealButton
                    create={props.createDeal}
                    onCreated={(brand) => {
                      setNotice(`Started ${brand}.`);
                      props.onRefresh();
                    }}
                  />
                </>
              ) : null}
              {list.deals.length > 1 ? (
                <DealFilter list={list} value={deal} onChange={setDeal} />
              ) : null}
            </div>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both">
        <div
          className={cn(
            "mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4 sm:p-6",
            selected && "min-[1100px]:pr-124",
          )}
        >
          <p className="text-sm text-muted-foreground">
            Agents draft scripts. Only a person approves them.
            {props.updatedAt ? ` Updated ${formatTime(props.updatedAt)}.` : ""}
          </p>
          {list?.bad.length ? (
            <details className="rounded-md border border-border p-3 text-sm">
              <summary className="cursor-pointer">
                {list.bad.length} {list.bad.length === 1 ? "file was" : "files were"} skipped
              </summary>
              <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                {list.bad.map((item) => (
                  <li key={`${item.file}:${item.reason}`}>
                    {item.file}: {item.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {problem ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive-foreground"
            >
              {problem}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="rounded-md border px-3 py-2 text-sm">
              {notice}
            </p>
          ) : null}
          {undo ? (
            <p
              role="status"
              className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
            >
              {undo.label}
              <Button
                size="xs"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  const back = undo.action;
                  setUndo(null);
                  void run(back);
                }}
              >
                Undo
              </Button>
            </p>
          ) : null}
          {list?.proposals.length ? (
            <ProposedDeals
              proposals={list.proposals}
              canAct={props.canAct}
              busy={busy}
              onDecide={(proposal, decision) => void decide(proposal, decision)}
            />
          ) : null}
          {body}
          {props.canAct && list ? (
            <PairComputer start={props.pairingStart} accept={props.pairingAccept} />
          ) : null}
        </div>
      </div>
    </SidebarInset>
  );
}

/** The error's own words when it has them. A ContentRpcError always does. */
const messageOf = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "message" in error &&
  typeof error.message === "string"
    ? error.message
    : "That did not work. Try again.";

export function ContentView() {
  const { environmentId, list, error, noWorkspace, refresh, canAct, updatedAt } = useContent();
  const runMove = useAtomCommand(contentMove);
  const runScript = useAtomCommand(contentSaveScript);
  const runHistory = useAtomCommand(contentHistory);
  const runCreateDeal = useAtomCommand(contentCreateDeal);
  const runDecideDeal = useAtomCommand(contentDecideDeal);
  const runSyncCommand = useAtomCommand(contentSync);
  const runPairingStart = useAtomCommand(contentPairingStart);
  const runPairingAccept = useAtomCommand(contentPairingAccept);
  const act: ActFn = async (action) => {
    if (!environmentId) return "No workspace is open.";
    const ref = { deal: action.deal, file: action.file };
    const result =
      action.kind === "move"
        ? await runMove({
            environmentId,
            input: { ...ref, to: action.to, ...(action.note ? { note: action.note } : {}) },
          })
        : await runScript({ environmentId, input: { ...ref, script: action.script } });
    if (!AsyncResult.isSuccess(result)) return messageOf(squashAtomCommandFailure(result));
    refresh();
    return result.value.video;
  };
  const loadHistory: LoadHistoryFn = async (ref) => {
    if (!environmentId) return null;
    const result = await runHistory({ environmentId, input: ref });
    return AsyncResult.isSuccess(result) ? result.value : null;
  };
  const createDeal: CreateDealFn = async (input) => {
    if (!environmentId) return "No workspace is open.";
    const result = await runCreateDeal({ environmentId, input });
    return AsyncResult.isSuccess(result)
      ? result.value.deal
      : messageOf(squashAtomCommandFailure(result));
  };
  const decideDeal: DecideDealFn = async (slug, decision) => {
    if (!environmentId) return "No workspace is open.";
    const result = await runDecideDeal({ environmentId, input: { slug, decision } });
    return AsyncResult.isSuccess(result) ? null : messageOf(squashAtomCommandFailure(result));
  };
  const sync: SyncFn = async () => {
    if (!environmentId) return "No workspace is open.";
    const result = await runSyncCommand({ environmentId, input: {} });
    return AsyncResult.isSuccess(result)
      ? result.value
      : messageOf(squashAtomCommandFailure(result));
  };
  const pairingStart: PairingStartFn = async () => {
    if (!environmentId) return "No workspace is open.";
    const result = await runPairingStart({ environmentId, input: {} });
    return AsyncResult.isSuccess(result)
      ? result.value
      : messageOf(squashAtomCommandFailure(result));
  };
  const pairingAccept: PairingAcceptFn = async (input) => {
    if (!environmentId) return "No workspace is open.";
    const result = await runPairingAccept({ environmentId, input });
    return AsyncResult.isSuccess(result)
      ? result.value
      : messageOf(squashAtomCommandFailure(result));
  };
  return (
    <ContentScreen
      list={list}
      error={error}
      noWorkspace={noWorkspace}
      updatedAt={updatedAt}
      canAct={canAct}
      act={act}
      loadHistory={loadHistory}
      createDeal={createDeal}
      decideDeal={decideDeal}
      sync={sync}
      pairingStart={pairingStart}
      pairingAccept={pairingAccept}
      onRefresh={refresh}
    />
  );
}

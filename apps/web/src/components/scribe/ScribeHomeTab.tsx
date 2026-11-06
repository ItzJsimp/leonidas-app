import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ScribeHistoryItem } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { MicIcon, SquareIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { useEnvironmentQuery } from "~/state/query";
import {
  scribeHistoryQuery,
  scribeRetry,
  scribeSettingsQuery,
  scribeStart,
  scribeStop,
} from "~/state/scribe";
import { useAtomCommand } from "~/state/use-atom-command";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import {
  commandErrorMessage,
  dictateButton,
  engineErrorView,
  homeShortcuts,
  liveLine,
  rowMeta,
  shouldRetryHistory,
} from "./home.logic";
import { CopyButton, KeyCaps } from "./ScribeParts";
import type { ScribeTabProps } from "./ScribePage";
import { mergeRecent } from "./scribeLive.logic";
import { rewriteLabel } from "./transcripts.logic";

export function ScribeHomeTab({ environmentId, live }: ScribeTabProps) {
  const history = useEnvironmentQuery(scribeHistoryQuery({ environmentId, input: { limit: 20 } }));
  const loaded = history.data?.items;
  const items = useMemo(() => mergeRecent(live.saved, loaded ?? []), [live.saved, loaded]);
  const previousConnected = useRef(live.connected);
  const historyFailed = history.error !== null;
  const { refresh } = history;
  useEffect(() => {
    if (shouldRetryHistory(previousConnected.current, live.connected, historyFailed)) refresh();
    previousConnected.current = live.connected;
  }, [live.connected, historyFailed, refresh]);
  return (
    <div className="flex flex-col gap-6">
      <DictateCard environmentId={environmentId} live={live} />
      {live.connected === false ? null : (
        <section aria-labelledby="scribe-recent" className="flex flex-col gap-2">
          <h2 id="scribe-recent" className="text-base font-semibold">
            Recent
          </h2>
          <RecentList
            items={items}
            loading={history.data === null && history.error === null}
            failed={history.error !== null && items.length === 0}
            onRetry={history.refresh}
          />
        </section>
      )}
    </div>
  );
}

function DictateCard({ environmentId, live }: ScribeTabProps) {
  const runStart = useAtomCommand(scribeStart, { reportFailure: false });
  const runStop = useAtomCommand(scribeStop, { reportFailure: false });
  const runRetry = useAtomCommand(scribeRetry, { reportFailure: false });
  const canStart = useAtomValue(scribeStart.permissionAtom(environmentId));
  const canStop = useAtomValue(scribeStop.permissionAtom(environmentId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const button = dictateButton(live.connected, live.state);
  const allowed = button.action === "stop" ? canStop : canStart;

  const press = async () => {
    if (busy || button.action === "none") return;
    setBusy(true);
    setError(null);
    const result =
      button.action === "start"
        ? await runStart({ environmentId, input: { mode: "toggle" } })
        : await runStop({ environmentId, input: { paste: false } });
    setBusy(false);
    if (result._tag !== "Success" && !isAtomCommandInterrupted(result)) {
      setError(commandErrorMessage(squashAtomCommandFailure(result)));
    }
  };

  const retry = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await runRetry({ environmentId, input: {} });
    setBusy(false);
    if (result._tag !== "Success" && !isAtomCommandInterrupted(result)) {
      setError(commandErrorMessage(squashAtomCommandFailure(result)));
    }
  };

  const failure = live.lastError ? engineErrorView(live.lastError) : null;
  const message =
    live.connected === false
      ? "Scribe engine is not running. Start it from the tray, or install it."
      : error;
  const line = liveLine(live.state, live.partial, live.lastTranscript);
  return (
    <section aria-label="Dictate" className="rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <Button
          size="xl"
          className="sm:min-w-32"
          variant={button.action === "stop" ? "destructive" : "default"}
          disabled={button.disabled || busy || !allowed}
          onClick={() => void press()}
        >
          {button.action === "stop" ? <SquareIcon aria-hidden /> : <MicIcon aria-hidden />}
          {button.label}
        </Button>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:pt-2.5">
          <p
            aria-live="polite"
            className={cn(
              "line-clamp-4 text-sm",
              line.hint ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {line.text}
          </p>
          {message ? (
            <p role="alert" className="text-sm text-destructive-foreground">
              {message}
            </p>
          ) : null}
          {live.lastError && failure ? (
            <div role="alert" className="flex flex-col items-start gap-2 text-sm">
              <div>
                <p className="font-medium">{failure.title}</p>
                <p className="text-muted-foreground">{live.lastError.message}</p>
              </div>
              {failure.retry ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !canStart}
                  onClick={() => void retry()}
                >
                  Retry
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <Shortcuts environmentId={environmentId} />
    </section>
  );
}

/** The shortcuts as key caps, so a new user finds them without the Settings tab. */
function Shortcuts(props: { readonly environmentId: ScribeTabProps["environmentId"] }) {
  const settings = useEnvironmentQuery(
    scribeSettingsQuery({ environmentId: props.environmentId, input: {} }),
  ).data;
  // Hidden until the settings load, so the card does not jump or show wrong keys.
  if (settings === null) return null;
  return (
    <dl className="grid gap-x-6 gap-y-3 border-t border-border/60 px-5 py-4 sm:grid-cols-3">
      {homeShortcuts(settings.sections.hotkeys).map((row) => (
        <div key={row.label} className="flex min-w-0 flex-col gap-1.5">
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {row.bindings.length === 0 ? (
              <span className="text-sm text-muted-foreground">Not set</span>
            ) : (
              row.bindings.map((binding, index) => (
                <span key={binding} className="inline-flex items-center gap-2">
                  {index > 0 ? <span className="text-xs text-muted-foreground">or</span> : null}
                  <KeyCaps binding={binding} />
                </span>
              ))
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RecentList(props: {
  readonly items: readonly ScribeHistoryItem[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly onRetry: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  if (props.items.length === 0 && props.loading) {
    return (
      <div
        className="flex flex-col gap-2"
        role="status"
        aria-busy="true"
        aria-label="Loading dictations"
      >
        {[0, 1, 2].map((key) => (
          <div key={key} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    );
  }
  if (props.failed) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm" role="alert">
        <p>Could not load your dictations.</p>
        <Button size="sm" variant="outline" onClick={props.onRetry}>
          Try again
        </Button>
      </div>
    );
  }
  if (props.items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm">
        <p>No dictations yet.</p>
        <p className="text-muted-foreground">Press Start, speak, then press Stop.</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {props.items.map((item) => {
        const rewrite = rewriteLabel(item);
        return (
          <li
            key={item.id}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="line-clamp-3 text-sm">{item.cleanedText}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {rewrite !== null ? (
                  <Badge variant="info" size="sm">
                    {rewrite}
                  </Badge>
                ) : null}
                <p className="text-xs text-muted-foreground">{rowMeta(item, now)}</p>
              </div>
            </div>
            <CopyButton
              text={item.cleanedText}
              label={rewrite === null ? "Copy dictation" : "Copy rewrite"}
            />
          </li>
        );
      })}
    </ul>
  );
}

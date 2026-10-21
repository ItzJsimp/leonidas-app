import { resolveUsageAccess } from "@t3tools/client-runtime/state/usage-access";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { CopyIcon, FolderOpenIcon } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";

import { RefreshIcon } from "~/components/ui/refresh-icon";
import { useEnvironments, usePrimaryEnvironmentId } from "~/state/environments";
import { useOpenInPreferredEditor } from "../../editorPreferences";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { cn } from "../../lib/utils";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { environmentSession, readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import { formatRelativeTimeLabel, getRelativeTimeState } from "../../timestampFormat";
import { ExpandableText } from "../settings/ExpandableText";
import { useRelativeTimeTick } from "../settings/settingsLayout";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Card, ErrorNote, Segmented, Stat } from "./SystemCareCharts";

const NUMBER_FORMAT = new Intl.NumberFormat();

function formatCount(value: number): string {
  return NUMBER_FORMAT.format(value);
}

function formatDuration(value: number): string {
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)} s`;
}

function formatRelative(value: DateTime.Utc | null): string {
  if (!value) return "No trace records";
  return formatRelativeTimeLabel(DateTime.formatIso(value));
}

function formatRelativeNoWrap(value: DateTime.Utc | null): string {
  return formatRelative(value).replaceAll(" ", "\u00a0");
}

function shortenTraceId(traceId: string): string {
  if (traceId.length <= 32) return traceId;
  return `${traceId.slice(0, 18)}...${traceId.slice(-10)}`;
}

function EmptyRows({ label }: { label: string }) {
  return <div className="px-5 py-6 text-sm text-muted-foreground">{label}</div>;
}

function DiagnosticsTable({
  headers,
  children,
  minTableWidth = "min-w-[640px]",
  columnWidths,
}: {
  headers: ReadonlyArray<string>;
  children: ReactNode;
  minTableWidth?: string;
  columnWidths?: ReadonlyArray<string>;
}) {
  return (
    <ScrollArea
      radius="none"
      chainVerticalScroll
      scrollFade
      hideScrollbars
      className="w-full max-w-full"
    >
      <table
        className={cn("w-full text-left text-xs", minTableWidth, columnWidths && "table-fixed")}
      >
        {columnWidths ? (
          <colgroup>
            {headers.map((header, index) => (
              <col key={header} className={columnWidths[index]} />
            ))}
          </colgroup>
        ) : null}
        <thead className="border-b border-border/60 text-xs text-muted-foreground">
          <tr>
            {headers.map((header, index) => (
              <th
                key={header}
                className={cn(
                  "whitespace-nowrap px-4 py-2.5 font-medium first:sm:pl-5 last:sm:pr-5",
                  !columnWidths && index === headers.length - 1 && "w-px",
                )}
              >
                {header.replaceAll(" ", "\u00a0")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">{children}</tbody>
      </table>
    </ScrollArea>
  );
}

function TraceIdCell({ traceId }: { traceId: string }) {
  const { copyToClipboard, isCopied: copied } = useCopyToClipboard({
    target: "trace ID",
    timeout: 1_200,
  });

  return (
    <div className="flex w-full min-w-0 max-w-full items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="min-w-0 flex-1 truncate font-mono text-2xs">
              {shortenTraceId(traceId)}
            </span>
          }
        />
        <TooltipPopup side="top" variant="code">
          {traceId}
        </TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-micro"
              variant="ghost-muted"
              aria-label={copied ? "Copied trace ID" : "Copy trace ID"}
              onClick={() => copyToClipboard(traceId)}
            >
              <CopyIcon className="size-3" />
            </Button>
          }
        />
        <TooltipPopup side="top">{copied ? "Copied" : "Copy full trace ID"}</TooltipPopup>
      </Tooltip>
    </div>
  );
}

function DiagnosticsLastChecked({ checkedAt }: { checkedAt: DateTime.Utc | null }) {
  useRelativeTimeTick();
  const relative = getRelativeTimeState(checkedAt ? DateTime.formatIso(checkedAt) : null);

  if (relative.status === "missing") {
    return <span className="text-xs text-muted-foreground">Checking</span>;
  }

  if (relative.status === "invalid") {
    return <span className="text-xs text-muted-foreground">Last check unknown</span>;
  }

  return (
    <span className="text-xs text-muted-foreground">
      {relative.suffix ? (
        <>
          Checked <span className="tabular-nums">{relative.value}</span> {relative.suffix}
        </>
      ) : (
        <>Checked {relative.value}</>
      )}
    </span>
  );
}

function DiagnosticsRefreshButton({
  isPending,
  label,
  onClick,
}: {
  isPending: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost-muted"
            disabled={isPending}
            onClick={onClick}
            aria-label={label}
          >
            <RefreshIcon refreshing={isPending} />
          </Button>
        }
      />
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

type LogView = "failures" | "repeated" | "slow" | "logs" | "names";

const LOG_VIEWS: ReadonlyArray<{ value: LogView; label: string }> = [
  { value: "failures", label: "Failures" },
  { value: "repeated", label: "Repeated" },
  { value: "slow", label: "Slowest" },
  { value: "logs", label: "Warnings" },
  { value: "names", label: "By name" },
];

/** Traces, failures and logs that Leonidas Code recorded on this computer. */
export function LogsPanel() {
  const environmentId = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const environment =
    environments.find((candidate) => candidate.environmentId === environmentId) ?? null;
  const observability = environment?.serverConfig?.observability;
  const availableEditors = environment?.serverConfig?.availableEditors;
  const canOpenHostEditor = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const session = useEnvironmentQuery(
    environmentId === null ? null : environmentSession.sessionStateAtom(environmentId),
  );
  const diagnosticsAccess = resolveUsageAccess({
    connectionPhase: environment?.connection.phase ?? "available",
    session: session.data,
    hasSessionError: session.error !== null,
  });
  const canReadDiagnostics = diagnosticsAccess.canReadDiagnostics;
  const openInEditor = useOpenInPreferredEditor(environmentId, availableEditors ?? []);
  const { data, error, isPending, refresh } = useEnvironmentQuery(
    environmentId === null || !canReadDiagnostics
      ? null
      : serverEnvironment.traceDiagnostics({ environmentId, input: {} }),
  );
  const [view, setView] = useState<LogView>("failures");
  const [isOpeningLogsDirectory, setIsOpeningLogsDirectory] = useState(false);
  const [openLogsDirectoryError, setOpenLogsDirectoryError] = useState<string | null>(null);

  const openLogsDirectory = useCallback(() => {
    const logsDirectoryPath = observability?.logsDirectoryPath ?? null;
    if (!logsDirectoryPath) return;

    if (
      environmentId === null ||
      !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)
    ) {
      return;
    }

    setIsOpeningLogsDirectory(true);
    setOpenLogsDirectoryError(null);
    void (async () => {
      const result = await openInEditor(logsDirectoryPath);
      setIsOpeningLogsDirectory(false);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        setOpenLogsDirectoryError(
          error instanceof Error
            ? error.message
            : "Could not open the logs folder. Check that the folder exists and try again.",
        );
      }
    })();
  }, [environmentId, observability?.logsDirectoryPath, openInEditor]);

  const isInitialLoading = isPending && data === null;
  const traceDiagnosticsError = data ? Option.getOrNull(data.error) : null;
  const traceDiagnosticsPartialFailure = data
    ? Option.getOrElse(data.partialFailure, () => false)
    : false;

  if (!canReadDiagnostics) {
    return (
      <Card title="Logs and errors">
        <p className="rounded-xl bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
          {environmentId === null
            ? "Connect this computer to see its logs."
            : diagnosticsAccess.isPending
              ? "Checking access to logs..."
              : diagnosticsAccess.error}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Traces"
        hint="What Leonidas Code recorded while it worked."
        action={
          <div className="flex items-center gap-1.5">
            <DiagnosticsLastChecked checkedAt={data?.readAt ?? null} />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    disabled={
                      !canOpenHostEditor ||
                      !observability?.logsDirectoryPath ||
                      isOpeningLogsDirectory
                    }
                    onClick={openLogsDirectory}
                    aria-label="Open logs folder"
                  >
                    <FolderOpenIcon />
                  </Button>
                }
              />
              <TooltipPopup side="top">Open logs folder</TooltipPopup>
            </Tooltip>
            <DiagnosticsRefreshButton
              isPending={isPending}
              label="Refresh traces"
              onClick={refresh}
            />
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
          <Stat label="Spans" value={data ? formatCount(data.recordCount) : "-"} />
          <Stat
            label="Failures"
            value={data ? formatCount(data.failureCount) : "-"}
            level={data && data.failureCount > 0 ? "critical" : undefined}
          />
          <Stat
            label="Slow spans"
            value={data ? formatCount(data.slowSpanCount) : "-"}
            detail={data ? `${formatDuration(data.slowSpanThresholdMs)} or longer` : undefined}
            level={data && data.slowSpanCount > 0 ? "warning" : undefined}
          />
          <Stat
            label="Unreadable lines"
            value={data ? formatCount(data.parseErrorCount) : "-"}
            level={data && data.parseErrorCount > 0 ? "warning" : undefined}
          />
        </div>
        {openLogsDirectoryError ? (
          <ErrorNote className="mt-4">{openLogsDirectoryError}</ErrorNote>
        ) : null}
        {traceDiagnosticsError ? (
          <ErrorNote
            className="mt-4"
            tone={traceDiagnosticsPartialFailure ? "warning" : "critical"}
          >
            {traceDiagnosticsPartialFailure
              ? `Some trace files could not be read, so this may be incomplete. ${traceDiagnosticsError.message}`
              : traceDiagnosticsError.message}
          </ErrorNote>
        ) : null}
        {error ? <ErrorNote className="mt-4">{error}</ErrorNote> : null}
      </Card>

      <Card
        title="Details"
        className="overflow-hidden"
        action={
          <Segmented label="Detail view" value={view} options={LOG_VIEWS} onChange={setView} />
        }
      >
        <div className="-mx-5 -mb-5 max-h-128 overflow-y-auto border-t">
          {view === "failures" ? (
            data && data.latestFailures.length > 0 ? (
              <DiagnosticsTable headers={["Span", "Cause", "Duration", "Ended"]}>
                {data.latestFailures.map((failure) => (
                  <tr key={`${failure.traceId}:${failure.spanId}`}>
                    <td className="px-4 py-3 align-top text-xs font-medium text-foreground first:sm:pl-5">
                      {failure.name}
                    </td>
                    <td className="max-w-[360px] px-4 py-3 align-top text-muted-foreground">
                      <ExpandableText text={failure.cause} />
                    </td>
                    <td className="px-4 py-3 align-top tabular-nums">
                      {formatDuration(failure.durationMs)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top tabular-nums text-muted-foreground last:sm:pr-5">
                      {formatRelativeNoWrap(failure.endedAt)}
                    </td>
                  </tr>
                ))}
              </DiagnosticsTable>
            ) : (
              <EmptyRows
                label={
                  isInitialLoading ? "Loading failures..." : "No failed spans. Nothing to fix."
                }
              />
            )
          ) : null}

          {view === "repeated" ? (
            data && data.commonFailures.length > 0 ? (
              <DiagnosticsTable
                headers={["Span", "Count", "Cause", "Last Seen"]}
                minTableWidth="min-w-[760px]"
              >
                {data.commonFailures.map((failure) => (
                  <tr key={`${failure.name}:${failure.cause}`}>
                    <td className="px-4 py-3 align-top text-xs font-medium text-foreground first:sm:pl-5">
                      {failure.name}
                    </td>
                    <td className="px-4 py-3 align-top tabular-nums">
                      {formatCount(failure.count)}
                    </td>
                    <td className="max-w-[360px] px-4 py-3 align-top text-muted-foreground">
                      <ExpandableText text={failure.cause} />
                    </td>
                    <td className="w-px whitespace-nowrap px-4 py-3 align-top tabular-nums text-muted-foreground last:sm:pr-5">
                      {formatRelativeNoWrap(failure.lastSeenAt)}
                    </td>
                  </tr>
                ))}
              </DiagnosticsTable>
            ) : (
              <EmptyRows
                label={
                  isInitialLoading
                    ? "Loading failure groups..."
                    : "No repeated failures. Nothing to fix."
                }
              />
            )
          ) : null}

          {view === "slow" ? (
            data && data.slowestSpans.length > 0 ? (
              <DiagnosticsTable
                headers={["Span", "Duration", "Ended", "Trace"]}
                minTableWidth="min-w-[900px]"
                columnWidths={["w-[44%]", "w-[14%]", "w-[12%]", "w-[30%]"]}
              >
                {data.slowestSpans.map((span) => (
                  <tr key={`${span.traceId}:${span.spanId}`}>
                    <td className="px-4 py-3 align-top text-xs font-medium text-foreground first:sm:pl-5">
                      {span.name}
                    </td>
                    <td className="px-4 py-3 align-top tabular-nums">
                      {formatDuration(span.durationMs)}
                    </td>
                    <td className="w-px whitespace-nowrap px-4 py-3 align-top tabular-nums text-muted-foreground">
                      {formatRelativeNoWrap(span.endedAt)}
                    </td>
                    <td className="min-w-0 whitespace-nowrap px-4 py-3 align-top text-muted-foreground last:sm:pr-5">
                      <TraceIdCell traceId={span.traceId} />
                    </td>
                  </tr>
                ))}
              </DiagnosticsTable>
            ) : (
              <EmptyRows label={isInitialLoading ? "Loading slow spans..." : "No spans found."} />
            )
          ) : null}

          {view === "logs" ? (
            data && data.latestWarningAndErrorLogs.length > 0 ? (
              <DiagnosticsTable
                headers={["Time", "Level", "Span", "Message", "Trace"]}
                minTableWidth="min-w-[920px]"
                columnWidths={["w-[11%]", "w-[9%]", "w-[24%]", "w-[26%]", "w-[30%]"]}
              >
                {data.latestWarningAndErrorLogs.map((event) => (
                  <tr
                    key={`${event.traceId}:${event.spanId}:${DateTime.formatIso(event.seenAt)}:${event.message}`}
                    className="hover:bg-muted/15"
                  >
                    <td className="whitespace-nowrap px-4 py-3 align-top tabular-nums text-muted-foreground sm:pl-5">
                      {formatRelativeNoWrap(event.seenAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium capitalize">
                        {event.level}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="truncate font-medium text-foreground">{event.spanName}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      <ExpandableText
                        collapsedClassName="line-clamp-2"
                        expandLabel="Show full message"
                        text={event.message}
                      />
                    </td>
                    <td className="min-w-0 whitespace-nowrap px-4 py-3 align-top text-muted-foreground sm:pr-5">
                      <TraceIdCell traceId={event.traceId} />
                    </td>
                  </tr>
                ))}
              </DiagnosticsTable>
            ) : (
              <EmptyRows
                label={
                  isInitialLoading
                    ? "Loading recent logs..."
                    : "No warnings or errors. Nothing to fix."
                }
              />
            )
          ) : null}

          {view === "names" ? (
            data && data.topSpansByCount.length > 0 ? (
              <DiagnosticsTable
                headers={["Span", "Count", "Failures", "Average", "Max"]}
                minTableWidth="min-w-[760px]"
                columnWidths={["w-[48%]", "w-[13%]", "w-[13%]", "w-[13%]", "w-[13%]"]}
              >
                {data.topSpansByCount.map((span) => (
                  <tr key={span.name}>
                    <td className="px-4 py-3 align-top text-xs font-medium text-foreground first:sm:pl-5">
                      {span.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top tabular-nums">
                      {formatCount(span.count)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top tabular-nums">
                      {formatCount(span.failureCount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top tabular-nums">
                      {formatDuration(span.averageDurationMs)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top tabular-nums last:sm:pr-5">
                      {formatDuration(span.maxDurationMs)}
                    </td>
                  </tr>
                ))}
              </DiagnosticsTable>
            ) : (
              <EmptyRows label={isInitialLoading ? "Loading span names..." : "No spans found."} />
            )
          ) : null}
        </div>
      </Card>
    </div>
  );
}

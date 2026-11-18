import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { SubagentRun } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { scheduleWords } from "~/components/automations/automations.logic";
import { Button } from "~/components/ui/button";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { buildThreadRouteParams } from "~/threadRoutes";

import { elapsedLabel, STATUS_LABEL } from "../windows/subagents/subagents.logic";
import {
  useHistoryRuns,
  useRunningRuns,
  type HistoryFilters,
} from "../windows/subagents/useSubagentRuns";
import { doneToday, runTitle, upcomingTasks } from "./activity.logic";

const NO_FILTERS: HistoryFilters = { status: null, parentThreadId: null, query: "" };
const SHOWN = 5;

function Section(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

const Quiet = (props: { readonly children: ReactNode }) => (
  <p className="text-sm text-muted-foreground">{props.children}</p>
);

function RunLine(props: { readonly run: SubagentRun; readonly action?: ReactNode }) {
  const { run } = props;
  return (
    <li className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{runTitle(run)}</p>
        <p className="truncate text-xs text-muted-foreground">{run.summary}</p>
      </div>
      {props.action}
    </li>
  );
}

/**
 * The right panel of the agent profile: what is running now (with Take over), what is scheduled
 * next, and what finished today. Show all opens the full run list on the Runs tab.
 */
export function AgentActivity() {
  const navigate = useNavigate();
  const running = useRunningRuns();
  const history = useHistoryRuns(true, NO_FILTERS, running.signature);
  const tasks = useEnvironmentQuery(
    running.environmentId
      ? serverEnvironment.scheduledTasksLive({ environmentId: running.environmentId, input: {} })
      : null,
  );
  // shortcut: the clock is the time of the last 5 s poll, not a ticking clock; add one if it feels slow.
  const now = running.updatedAt;
  const live = running.runs ?? [];
  // Before the first poll `now` is 0, which would make every run count as today.
  const finished = now === 0 ? [] : doneToday(history.runs ?? [], now);
  const next = upcomingTasks(tasks.data?.tasks ?? [], SHOWN);

  const takeOver = (run: SubagentRun) => {
    if (running.environmentId === null || run.childThreadId === null) return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(running.environmentId, run.childThreadId)),
    });
  };
  const showAll = () => void navigate({ to: ".", search: { tab: "runs" } as never, replace: true });

  return (
    <aside
      aria-label="Activity"
      className="hidden w-72 shrink-0 flex-col gap-5 overflow-y-auto border-l border-border p-4 lg:flex"
    >
      <Section title="In progress">
        {live.length === 0 ? (
          <Quiet>Nothing is running.</Quiet>
        ) : (
          <ul className="flex flex-col gap-2">
            {live.map((run) => (
              <RunLine
                key={run.id}
                run={run}
                action={
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={run.childThreadId === null}
                    onClick={() => takeOver(run)}
                  >
                    Take over
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </Section>
      <Section title="Scheduled">
        {next.length === 0 ? (
          <Quiet>No schedules are on.</Quiet>
        ) : (
          <ul className="flex flex-col gap-2">
            {next.map((task) => (
              <li key={task.id} className="min-w-0">
                <p className="truncate text-sm text-foreground">{task.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {scheduleWords(task.schedule)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Done today">
        {finished.length === 0 ? (
          <Quiet>Nothing has finished today.</Quiet>
        ) : (
          <ul className="flex flex-col gap-2">
            {finished.slice(0, SHOWN).map((run) => (
              <RunLine
                key={run.id}
                run={run}
                action={
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {STATUS_LABEL[run.status]} {elapsedLabel(run, now)}
                  </span>
                }
              />
            ))}
          </ul>
        )}
        <Button size="xs" variant="ghost" className="self-start" onClick={showAll}>
          Show all
        </Button>
      </Section>
    </aside>
  );
}

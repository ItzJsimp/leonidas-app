import { Link } from "@tanstack/react-router";
import { CheckIcon, CompassIcon, FolderSearchIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { taskBoardHomeQuery } from "~/state/taskBoard";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { lensHome } from "~/components/team/teamLens.logic";
import { useLensWork } from "~/components/team/useLensWork";

const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** The AIOS Home: one next move, today's brief priorities and open-task counts. Reads files only. */
export function AiosHomeCard() {
  const environmentId = usePrimaryEnvironmentId();
  const { scope, scopeReady } = useActiveAiosWorkspace();
  const home = useEnvironmentQuery(
    environmentId && scopeReady ? taskBoardHomeQuery({ environmentId, input: scope }) : null,
  );
  const { data, error, refresh } = home;
  const { lens } = useLensWork();
  const filtered = lens ? lensHome(lens.label, lens.tasks) : null;

  if (data === null && error !== null) {
    return (
      <section role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm">
        <p className="font-medium">Could not read your AIOS folder</p>
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
        <Spinner /> Reading your AIOS folder...
      </div>
    );
  }
  if (data.root === null) {
    return (
      <section className="rounded-lg border border-dashed p-4 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <FolderSearchIcon aria-hidden className="size-4 text-muted-foreground" />
          No AIOS folder connected yet
        </div>
        <p className="mt-1 text-muted-foreground">
          Your AIOS is the folder with your notes and tasks. Pick it on the Tasks page. Then your
          daily focus shows here.
        </p>
        <Link
          to="/tasks"
          className="mt-2 inline-block rounded-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        >
          Open Tasks
        </Link>
      </section>
    );
  }

  const { brief } = data;
  const counts = filtered?.counts ?? data.counts;
  const move = filtered?.move ?? data.move;
  const done = brief?.priorities.filter((priority) => priority.done).length ?? 0;
  return (
    <section aria-labelledby="aios-home-title" className="rounded-lg border border-border p-5">
      <div className="flex items-start gap-3">
        <CompassIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            The focus
          </p>
          <h2 id="aios-home-title" className="mt-1 text-base font-semibold">
            {move.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{move.reason}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={refresh} aria-label="Refresh Home">
          <RefreshCwIcon aria-hidden />
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ["To do", counts.todo],
            ["In progress", counts.inProgress],
            ["In review", counts.review],
            ["Blocked", counts.blocked],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-md bg-muted/40 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Today's priorities</h3>
          {brief && brief.priorities.length > 0 ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              {done} of {brief.priorities.length} complete
            </p>
          ) : null}
        </div>
        {brief === null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No daily brief yet. Briefs saved in logs/briefings show here.
          </p>
        ) : (
          <>
            {brief.date !== localDate() ? (
              <p className="mt-1 text-xs text-warning">From the {brief.date} brief.</p>
            ) : null}
            <ol className="mt-2 flex flex-col gap-2">
              {brief.priorities.map((priority) => (
                <li
                  key={priority.title}
                  className="flex items-start gap-3 rounded-md border border-border px-3 py-2"
                >
                  <span
                    aria-label={priority.done ? "Done" : "Not done"}
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                      priority.done ? "border-success bg-success text-background" : "border-border",
                    )}
                  >
                    {priority.done ? <CheckIcon aria-hidden className="size-3" /> : null}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-sm",
                        priority.done && "text-muted-foreground line-through",
                      )}
                    >
                      {priority.title}
                    </p>
                    {priority.detail ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{priority.detail}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}

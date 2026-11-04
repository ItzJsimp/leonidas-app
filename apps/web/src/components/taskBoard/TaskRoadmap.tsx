import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { ArrowDownIcon, CheckIcon, CircleIcon, FlagIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { taskBoardCardCreate } from "~/state/taskBoard";
import { workspaceScopeInput } from "~/components/workspace/aiosWorkspace.logic";
import { activeWorkspaceId } from "~/components/workspace/aiosWorkspaceStore";
import { useAtomCommand } from "~/state/use-atom-command";

import { StatusBadge } from "./TaskBadges";
import { TaskRoadmapMap } from "./TaskRoadmapMap";
import type { TaskView } from "./taskBoard.logic";
import type { TaskActions } from "./taskBoard.types";
import { buildRoadmap, missingRoadmapTasks, type RoadmapPlan } from "./taskRoadmap.logic";
import { failureText } from "./useTaskActions.logic";

/** A release path backed by ordinary tasks: completing or moving a task updates its release gate. */
export function TaskRoadmapView(props: {
  readonly plan: RoadmapPlan;
  readonly tasks: ReadonlyArray<TaskView>;
  readonly environmentId: EnvironmentId | null;
  readonly member: string;
  readonly actions: TaskActions;
  readonly onSelect: (task: TaskView) => void;
  readonly onRefresh: () => void;
}) {
  const { plan, tasks, actions } = props;
  const stages = useMemo(() => buildRoadmap(plan, tasks), [plan, tasks]);
  const missing = useMemo(() => missingRoadmapTasks(plan, tasks), [plan, tasks]);
  const unscheduled = tasks.filter((task) => task.section === plan.projectSlug && !task.milestone);
  const runCreate = useAtomCommand(taskBoardCardCreate, { reportFailure: false });
  const canCreate = useAtomValue(taskBoardCardCreate.permissionAtom(props.environmentId));
  const [importing, setImporting] = useState(false);
  const [presentation, setPresentation] = useState<"map" | "details">("map");
  const [error, setError] = useState<string | null>(null);
  const [importedKeys, setImportedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const pending = missing.filter((task) => !importedKeys.has(task.key));
  const pendingPerStep = new Map<string, number>();
  for (const task of pending)
    pendingPerStep.set(task.milestone, (pendingPerStep.get(task.milestone) ?? 0) + 1);
  const total = stages.reduce((count, stage) => count + stage.total, 0);
  const done = stages.reduce((count, stage) => count + stage.done, 0);
  const nextVersion = stages.find((stage) => !stage.complete)?.version;

  const importTasks = async () => {
    if (!props.environmentId || !canCreate || importing) return;
    setImporting(true);
    setError(null);
    try {
      for (const task of pending) {
        const result = await runCreate({
          environmentId: props.environmentId,
          input: {
            ...workspaceScopeInput(activeWorkspaceId(props.environmentId)),
            title: task.title,
            description: task.description,
            projectSlug: plan.projectSlug,
            milestone: task.milestone,
            actor: props.member,
            priority: task.priority === "critical" ? "critical" : "high",
          },
        });
        if (result._tag !== "Success") {
          if (!isAtomCommandInterrupted(result))
            setError(
              failureText(
                squashAtomCommandFailure(result),
                "Could not add roadmap tasks. Select Add again. It adds only the missing tasks.",
              ),
            );
          break;
        }
        setImportedKeys((keys) => new Set(keys).add(task.key));
      }
    } catch (cause) {
      setError(
        failureText(
          cause,
          "Could not add roadmap tasks. Select Add again. It adds only the missing tasks.",
        ),
      );
    } finally {
      setImporting(false);
      props.onRefresh();
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-6 sm:px-6" data-tour="tasks-roadmap">
      <section aria-label="Update goal" className="space-y-3 border-b border-border pb-6">
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground tabular-nums">
          From V{plan.currentVersion} (last accepted) to
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <FlagIcon aria-hidden className="size-4" />V{plan.targetVersion} (goal)
          </span>
        </p>
        <h3 className="text-2xl font-semibold tracking-tight">The path to V{plan.targetVersion}</h3>
        <details className="max-w-2xl text-sm text-muted-foreground">
          <summary className="cursor-pointer rounded outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            What V{plan.targetVersion} includes
          </summary>
          <p className="mt-2 leading-relaxed">{plan.releaseDefinition}</p>
        </details>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-sm tabular-nums">
            {done} of {total} roadmap tasks done, {stages.filter((stage) => stage.complete).length}{" "}
            of {stages.length} steps done
            {pending.length > 0 ? `, ${pending.length} planned tasks not yet added` : null}
          </p>
          {pending.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirming(true)}
              disabled={!props.environmentId || !canCreate || importing}
            >
              {importing ? <Spinner /> : <PlusIcon aria-hidden />}
              {importing ? "Adding tasks…" : `Add ${pending.length} planned tasks`}
            </Button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Add {pending.length} planned tasks?</AlertDialogTitle>
            <AlertDialogDescription>
              Each one becomes a task card in {plan.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-1 px-6 text-sm tabular-nums">
            {[...pendingPerStep].map(([version, count]) => (
              <li key={version} className="flex justify-between gap-4">
                <span>V{version}</span>
                <span className="text-muted-foreground">
                  {count} {count === 1 ? "task" : "tasks"}
                </span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirming(false);
                void importTasks();
              }}
            >
              Add {pending.length} tasks
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      <ToggleGroup
        aria-label="Roadmap presentation"
        value={[presentation]}
        onValueChange={(values) => {
          if (values[0] === "map" || values[0] === "details") setPresentation(values[0]);
        }}
      >
        <Toggle value="map">Connected map</Toggle>
        <Toggle value="details">Milestone details</Toggle>
      </ToggleGroup>
      {presentation === "map" ? (
        <TaskRoadmapMap
          currentVersion={plan.currentVersion}
          stages={stages}
          onSelect={props.onSelect}
        />
      ) : (
        <ol aria-label="Version milestones" className="space-y-0">
          {stages.map((stage, index) => (
            <li
              key={stage.version}
              className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 pb-8 sm:gap-5"
            >
              <div className="relative flex justify-center">
                {index < stages.length - 1 ? (
                  <div aria-hidden className="absolute top-6 bottom-[-2rem] w-px bg-border" />
                ) : null}
                <span
                  className={
                    stage.complete
                      ? "relative flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      : "relative flex size-6 items-center justify-center rounded-full border border-border bg-background text-xs text-muted-foreground"
                  }
                >
                  {stage.complete ? <CheckIcon aria-hidden className="size-3.5" /> : index + 1}
                </span>
              </div>
              <section
                aria-label={`V${stage.version} ${stage.title}`}
                className="min-w-0 space-y-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h4 className="text-base font-semibold">
                    <span className="mr-2 font-mono text-sm tabular-nums">V{stage.version}</span>
                    {stage.title}
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    {stage.complete
                      ? "Step done"
                      : stage.version === nextVersion
                        ? "Next step"
                        : "Planned"}
                    , {stage.done} of {stage.total} done
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{stage.goal}</p>
                <div
                  role="progressbar"
                  aria-label={`V${stage.version} task completion`}
                  aria-valuemin={0}
                  aria-valuemax={stage.total || 1}
                  aria-valuenow={stage.done}
                  className="h-1 overflow-hidden rounded bg-muted"
                >
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${stage.total ? (stage.done / stage.total) * 100 : 0}%` }}
                  />
                </div>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {stage.tasks.map((task) => (
                    <li key={task.id} className="flex items-center gap-2 px-2 py-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`}
                        disabled={!actions.canEdit || actions.isBusy(task.id)}
                        onClick={() =>
                          actions.setStatus(task, task.status === "done" ? "todo" : "done")
                        }
                      >
                        {task.status === "done" ? (
                          <CheckIcon aria-hidden />
                        ) : (
                          <CircleIcon aria-hidden />
                        )}
                      </Button>
                      <button
                        type="button"
                        onClick={() => props.onSelect(task)}
                        className="min-w-0 flex-1 rounded py-2 text-left text-sm outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        {task.title}
                      </button>
                      <span className="hidden sm:inline">
                        <StatusBadge status={task.status} />
                      </span>
                    </li>
                  ))}
                  {stage.missing.map((task) => (
                    <li key={task.key} className="px-3 py-3">
                      <details>
                        <summary className="cursor-pointer text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                          {task.title}
                          <span className="ml-2 text-xs text-muted-foreground">Planned brief</span>
                        </summary>
                        <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                          {task.description}
                        </p>
                      </details>
                    </li>
                  ))}
                  {stage.total === 0 ? (
                    <li className="px-3 py-3 text-sm text-muted-foreground">
                      No tasks assigned. Assign a milestone in task details.
                    </li>
                  ) : null}
                </ul>
                {index > 0 ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ArrowDownIcon aria-hidden className="size-3" />
                    Follows V{stages[index - 1]?.version}
                  </p>
                ) : null}
              </section>
            </li>
          ))}
        </ol>
      )}
      {unscheduled.length > 0 ? (
        <section aria-label="Unscheduled tasks" className="space-y-2 border-t border-border pt-5">
          <h3 className="font-semibold">Unscheduled ({unscheduled.length})</h3>
          <p className="text-sm text-muted-foreground">
            Open a task and assign a version milestone to include it in the update plan.
          </p>
          <ul>
            {unscheduled.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => props.onSelect(task)}
                  className="rounded py-2 text-left text-sm outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  {task.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

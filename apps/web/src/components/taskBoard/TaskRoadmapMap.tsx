import { CheckIcon, CircleIcon, FlagIcon, MinusIcon, PlusIcon } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { observeResize } from "~/lib/observeResize";
import { StatusBadge } from "./TaskBadges";
import type { TaskView } from "./taskBoard.logic";
import type { buildRoadmap } from "./taskRoadmap.logic";

type Stage = ReturnType<typeof buildRoadmap<TaskView>>[number];
type Point = { x: number; y: number; top: number; bottom: number; left: number; right: number };

/** Measured connectors follow the real HTML nodes, including wrapped titles and expanded task briefs. */
export function TaskRoadmapMap(props: {
  readonly currentVersion: string;
  readonly stages: ReadonlyArray<Stage>;
  readonly onSelect: (task: TaskView) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const marker = useId().replace(/:/g, "");
  const [zoom, setZoom] = useState(0.85);
  const [drawing, setDrawing] = useState({ width: 0, height: 0, paths: [] as string[] });

  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const measure = () => {
      const points = new Map<string, Point>();
      const root = element.getBoundingClientRect();
      const scale = root.width / element.offsetWidth || 1;
      for (const node of element.querySelectorAll<HTMLElement>("[data-roadmap-node]")) {
        const rect = node.getBoundingClientRect();
        const left = (rect.left - root.left) / scale;
        const top = (rect.top - root.top) / scale;
        const width = rect.width / scale;
        const height = rect.height / scale;
        points.set(node.dataset.roadmapNode!, {
          x: left + width / 2,
          y: top + height / 2,
          left,
          right: left + width,
          top,
          bottom: top + height,
        });
      }
      const paths: string[] = [];
      let previous = points.get("baseline");
      for (const stage of props.stages) {
        const parent = points.get(`stage:${stage.version}`);
        if (!parent) continue;
        if (previous) paths.push(`M ${previous.x} ${previous.bottom + 3} V ${parent.top - 6}`);
        const keys = [
          ...stage.tasks.map((task) => `task:${task.id}`),
          ...stage.missing.map((task) => `brief:${task.key}`),
        ];
        for (const key of keys) {
          const child = points.get(key);
          if (!child) continue;
          const branch = parent.right + (child.left - parent.right) / 2;
          paths.push(
            `M ${parent.right + 3} ${parent.y} H ${branch} V ${child.y} H ${child.left - 6}`,
          );
        }
        previous = parent;
      }
      setDrawing({ width: element.offsetWidth, height: element.offsetHeight, paths });
    };
    const stopObserving = observeResize(
      [element, ...element.querySelectorAll<HTMLElement>("[data-roadmap-node]")],
      measure,
    );
    measure();
    return () => {
      stopObserving();
    };
  }, [props.stages]);

  return (
    <section aria-label="Connected update map" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Follow the arrows down through versions. Branches show the work for each update.
        </p>
        <div className="flex items-center gap-1" aria-label="Map zoom">
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Zoom out roadmap"
            disabled={zoom <= 0.4}
            onClick={() => setZoom((value) => Math.max(0.4, value - 0.15))}
          >
            <MinusIcon aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`${Math.round(zoom * 100)}% zoom, select to reset`}
            onClick={() => setZoom(0.85)}
          >
            {Math.round(zoom * 100)}%
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Zoom in roadmap"
            disabled={zoom >= 1.5}
            onClick={() => setZoom((value) => Math.min(1.5, value + 0.15))}
          >
            <PlusIcon aria-hidden />
          </Button>
        </div>
      </div>
      <div
        className="overflow-x-auto rounded-lg border border-border bg-muted/20"
        tabIndex={0}
        aria-label="Roadmap canvas. Scroll horizontally or use zoom to inspect branches."
      >
        <div ref={canvas} className="relative min-w-[560px] space-y-3 p-3" style={{ zoom }}>
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 text-muted-foreground/50"
            width={drawing.width}
            height={drawing.height}
          >
            <defs>
              <marker
                id={marker}
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <path d="M 0 0 L 7 3.5 L 0 7 z" fill="currentColor" />
              </marker>
            </defs>
            {drawing.paths.map((path) => (
              <path
                key={path}
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                markerEnd={`url(#${marker})`}
              />
            ))}
          </svg>
          <div className="relative grid grid-cols-[11rem_minmax(0,1fr)] gap-8">
            <div
              data-roadmap-node="baseline"
              className="rounded-lg border border-primary/40 bg-background px-3 py-2"
            >
              <p className="text-xs text-muted-foreground">Start here · Last accepted milestone</p>
              <p className="font-mono text-base font-semibold">V{props.currentVersion}</p>
            </div>
            <p className="self-center text-xs leading-relaxed text-muted-foreground">
              Versions connect in the order of the updates.
              <br />
              Select a task node to inspect its brief and actions.
            </p>
          </div>
          {props.stages.map((stage, index) => (
            <div
              key={stage.version}
              className="relative grid grid-cols-[11rem_minmax(0,1fr)] items-center gap-8"
            >
              <article
                data-roadmap-node={`stage:${stage.version}`}
                aria-label={`Step ${index + 1}: V${stage.version} ${stage.title}`}
                className={
                  stage.complete
                    ? "rounded-lg border border-primary/50 bg-background px-3 py-2"
                    : "rounded-lg border border-border bg-background px-3 py-2"
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Step {index + 1}</span>
                  {stage.complete ? (
                    <CheckIcon aria-label="Step done" className="size-4 text-primary" />
                  ) : index === props.stages.length - 1 ? (
                    <FlagIcon aria-hidden className="size-4 text-muted-foreground" />
                  ) : null}
                </div>
                <h4 className="font-mono text-sm font-semibold">V{stage.version}</h4>
                <p className="text-sm font-medium">{stage.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stage.done}/{stage.total} tasks complete
                </p>
                <div className="mt-1 h-1 rounded bg-muted">
                  <div
                    className="h-full rounded bg-primary"
                    style={{ width: `${stage.total ? (stage.done / stage.total) * 100 : 0}%` }}
                  />
                </div>
              </article>
              <ul
                aria-label={`Tasks for V${stage.version}`}
                className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-1.5"
              >
                {stage.tasks.map((task) => (
                  <li key={task.id}>
                    <button
                      data-roadmap-node={`task:${task.id}`}
                      type="button"
                      onClick={() => props.onSelect(task)}
                      className="flex min-h-9 w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left outline-hidden hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      {task.status === "done" ? (
                        <CheckIcon aria-hidden className="size-4 shrink-0 text-primary" />
                      ) : (
                        <CircleIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 text-xs leading-snug">{task.title}</span>
                      <StatusBadge status={task.status} />
                    </button>
                  </li>
                ))}
                {stage.missing.map((task) => (
                  <li key={task.key}>
                    <details
                      data-roadmap-node={`brief:${task.key}`}
                      className="min-h-9 rounded-md border border-dashed border-border bg-background px-2 py-1.5"
                    >
                      <summary className="cursor-pointer text-xs outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                        {task.title}
                        <span className="ml-2 text-xs text-muted-foreground">Planned</span>
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                        {task.description}
                      </p>
                    </details>
                  </li>
                ))}
                {stage.total === 0 ? (
                  <li className="col-span-full text-xs text-muted-foreground">
                    Assign tasks to this step.
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

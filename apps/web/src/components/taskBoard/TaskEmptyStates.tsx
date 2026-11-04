import { RouteIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";

import { usePlacePrompt } from "./DirectionSection";

export type TasksEmptyContext = {
  query: string;
  onClearFilters: (() => void) | null;
  inbox: { open: number; onShowAll: () => void } | null;
};

/** The empty List or Board: says why it is empty (search, filters, Inbox) and gives a way out. */
export function TasksEmpty(props: TasksEmptyContext & { icon: ReactNode }) {
  const { query, onClearFilters, inbox } = props;
  const [title, description] = query
    ? [`No task matches "${query}"`, "Check the spelling, or clear the search to see every task."]
    : onClearFilters
      ? ["No task matches your filters", "Clear the filters to see all your tasks again."]
      : inbox && inbox.open > 0
        ? [
            "Inbox is empty",
            `Inbox holds tasks with no project. ${inbox.open} open ${inbox.open === 1 ? "task is" : "tasks are"} in All tasks.`,
          ]
        : inbox
          ? [
              "Inbox is empty",
              "Inbox holds tasks with no project. Type a task in the box above to add one.",
            ]
          : [
              "No tasks here",
              "Tasks come from the files in your AIOS task folder. Type a task in the box above to add one.",
            ];
  const action = onClearFilters
    ? { label: query ? "Clear search" : "Clear filters", run: onClearFilters }
    : inbox && inbox.open > 0
      ? { label: "Show All tasks", run: inbox.onShowAll }
      : null;
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">{props.icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? (
        <EmptyContent>
          <Button variant="outline" onClick={action.run}>
            {action.label}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

const roadmapPrompt = (name: string, slug: string) =>
  `Create the file project-roadmap.json for the ${name} project (slug "${slug}"). ` +
  "Ask me for the current version, the goal version and 3 to 5 steps between. " +
  "Then write the file with these fields: projectSlug, name, currentVersion, targetVersion, " +
  "releaseDefinition, and milestones. Each milestone has version, title, goal and tasks. " +
  "Each task has key, title and priority.";

/** The empty Roadmap: one button starts a chat that writes the plan file with the user. */
export function RoadmapEmpty(props: { name: string; slug: string }) {
  const { place, notice, fallbackText } = usePlacePrompt();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <RouteIcon />
        </EmptyMedia>
        <EmptyTitle>No update plan yet</EmptyTitle>
        <EmptyDescription>
          An update plan lists the versions you want to ship and the tasks for each one. Your AI can
          write it with you. Then assign tasks to versions in their details.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => void place(roadmapPrompt(props.name, props.slug))}>
          Create plan with AI
        </Button>
        {notice ? (
          <p role="status" className="text-muted-foreground text-xs">
            {notice}
          </p>
        ) : null}
        {fallbackText ? (
          <pre className="max-w-prose whitespace-pre-wrap text-left text-xs">{fallbackText}</pre>
        ) : null}
      </EmptyContent>
    </Empty>
  );
}

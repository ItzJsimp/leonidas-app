import { createFileRoute } from "@tanstack/react-router";

import { TasksPage } from "../components/taskBoard/TasksPage";

export const Route = createFileRoute("/_chat/tasks")({
  // `task` opens that task card, for links from the Command Center.
  validateSearch: (search: Record<string, unknown>): { task?: string | undefined } => ({
    task: typeof search.task === "string" ? search.task : undefined,
  }),
  component: TasksPage,
});

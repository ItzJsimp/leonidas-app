import { createFileRoute } from "@tanstack/react-router";

import { TasksPage } from "../components/taskBoard/TasksPage";

export const Route = createFileRoute("/_chat/tasks")({
  component: TasksPage,
  // `?task=<id>` opens that card, for links from chats and notices.
  validateSearch: (search: Record<string, unknown>): { task?: string } =>
    typeof search.task === "string" && search.task !== "" ? { task: search.task } : {},
});

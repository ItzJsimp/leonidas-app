import { Link, useNavigate } from "@tanstack/react-router";
import { FolderKanbanIcon, FolderIcon, PlusIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { openCommandPalette } from "~/commandPaletteBus";
import { useNowMinute } from "~/hooks/useNowMinute";
import { openNewAiosProject } from "~/components/workspace/newAiosProjectStore";
import { useAiosProjectRoot } from "~/components/workspace/useAiosProjectRoot";

import { RailWindow } from "../../twoState/RailWindow";
import { activityLabel } from "./projects.logic";
import { useProjectRows } from "./useProjectRows";

const addProject = () => openCommandPalette({ open: "add-project" });
const BUTTON_LINK =
  "inline-flex h-7 items-center rounded-md border border-border px-2 text-xs font-medium hover:bg-surface-raised focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:h-6";

/** The Projects window: one row per project with its chats, its last activity and two actions. */
export function ProjectsWindow() {
  const { rows } = useProjectRows();
  const canMakeProject = useAiosProjectRoot().root !== null;
  const navigate = useNavigate();
  const now = Date.parse(`${useNowMinute()}Z`);
  return (
    <RailWindow
      title="Projects"
      actions={
        <>
          {canMakeProject ? (
            <Button size="xs" onClick={openNewAiosProject}>
              <PlusIcon aria-hidden />
              New project
            </Button>
          ) : null}
          <Button size="xs" variant="outline" onClick={addProject}>
            <FolderIcon aria-hidden />
            Add a folder
          </Button>
        </>
      }
    >
      {rows === null ? (
        <div role="status" aria-label="Loading your projects" className="flex flex-col gap-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-16 w-full" shape="card" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <FolderKanbanIcon aria-hidden className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No projects yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            A project is a folder for one topic: its goal, rules and notes. A chat in it reads only
            that folder, so answers improve and cost less.
          </p>
          <div className="mt-1 flex gap-2">
            {canMakeProject ? (
              <Button size="sm" onClick={openNewAiosProject}>
                <PlusIcon aria-hidden />
                New project
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={addProject}>
              <FolderIcon aria-hidden />
              Add a folder
            </Button>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <FolderIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 basis-40">
                <span className="block truncate text-sm font-medium">{row.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {activityLabel(row.chats, row.lastActivity, now)}
                </span>
              </span>
              <span className="flex shrink-0 gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={row.newest === null}
                  onClick={() => {
                    const newest = row.newest;
                    if (newest === null) return;
                    void navigate({
                      to: "/$environmentId/$threadId",
                      params: { environmentId: newest.environmentId, threadId: newest.id },
                    });
                  }}
                >
                  Open newest chat
                </Button>
                <Link
                  to="/settings/projects"
                  search={{ project: row.key, machine: undefined } as never}
                  className={BUTTON_LINK}
                >
                  Settings
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </RailWindow>
  );
}

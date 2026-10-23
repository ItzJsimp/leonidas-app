import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  CirclePauseIcon,
  LayoutDashboardIcon,
  ShieldQuestionIcon,
  ActivityIcon,
} from "lucide-react";
import { useMemo } from "react";

import { groupCommandCenterThreads, type CommandCenterStatus } from "../commandCenter";
import { WorkspacePageContainer } from "../components/WorkspacePageContainer";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { ScribeStatusCard } from "../components/ScribeStatusCard";
import { AiosHomeCard } from "../components/taskBoard/AiosHomeCard";
import { WorkspacePackWidgets } from "../components/taskBoard/WorkspacePackWidgets";
import { DirectionSection } from "../components/taskBoard/DirectionSection";
import { HomeExtraCards } from "../components/taskBoard/HomeExtraCards";
import { LayaMonitorCard } from "../components/taskBoard/LayaMonitorCard";
import { PonytailCard } from "../components/taskBoard/PonytailCard";
import { SubagentStudio } from "../components/subagents/SubagentStudio";
import { TeamLensProvider } from "../components/team/TeamLensContext";
import { useActiveAiosWorkspace } from "../components/workspace/useActiveAiosWorkspace";
import { TeamView } from "../components/team/TeamView";
import { SidebarInset } from "../components/ui/sidebar";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { Spinner } from "../components/ui/spinner";
import { isElectron } from "../env";
import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useThreadShells,
} from "../state/entities";
import { useEnvironments } from "../state/environments";
import { buildThreadRouteParams } from "../threadRoutes";
import { cn } from "../lib/utils";

const STATUS_LABELS: Record<CommandCenterStatus, string> = {
  approval: "Needs permission",
  input: "Needs your answer",
  limited: "Usage limit reached",
  working: "Working",
  waiting: "Waiting for background work",
};
const SECTIONS = [
  {
    key: "attention",
    title: "Needs attention",
    description: "Chats that wait for your permission or your answer.",
    empty: "Nothing needs you right now.",
    Icon: ShieldQuestionIcon,
    tone: "text-warning",
  },
  {
    key: "limited",
    title: "Limited",
    description: "Chats that stopped because you reached a usage limit.",
    empty: "No chat has reached a usage limit.",
    Icon: CirclePauseIcon,
    tone: "text-destructive",
  },
  {
    key: "running",
    title: "Running",
    description: "Chats that work now, and background work.",
    empty: "No AI is working right now.",
    Icon: ActivityIcon,
    tone: "text-primary",
  },
] as const;

function CommandCenterBody() {
  const threads = useThreadShells();
  const projects = useProjects();
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const { environments, isReady } = useEnvironments();
  const groups = useMemo(() => groupCommandCenterThreads(threads), [threads]);
  const projectNames = useMemo(
    () =>
      new Map(
        projects.map((project) => [
          JSON.stringify([project.environmentId, project.id]),
          project.title,
        ]),
      ),
    [projects],
  );
  const environmentById = useMemo(
    () => new Map(environments.map((environment) => [environment.environmentId, environment])),
    [environments],
  );
  const disconnected = environments.filter(
    (environment) => environment.connection.phase !== "connected",
  );
  const total = groups.attention.length + groups.limited.length + groups.running.length;

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <WorkspacePageHeader electron={isElectron} className="border-b border-border">
        <LayoutDashboardIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <h1 className="truncate text-sm font-medium">Command Center</h1>
      </WorkspacePageHeader>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <WorkspacePageContainer width="wide">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Your AI work, at a glance</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Live status across your connected computers. Open a chat to see or continue its work.
            </p>
          </div>
          <DirectionSection />
          <AiosHomeCard />
          <WorkspacePackWidgets />
          <TeamView />
          <HomeExtraCards />
          <LayaMonitorCard />
          <PonytailCard />
          <SubagentStudio />
          {disconnected.length > 0 ? (
            <div
              role="status"
              className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm"
            >
              <p className="font-medium">Some computers are not connected</p>
              <p className="mt-1 text-muted-foreground">
                {disconnected.map((environment) => environment.label).join(", ")}. Their saved
                statuses may be out of date.
              </p>
              <Link
                to="/settings/connections"
                className="mt-2 inline-block rounded-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
              >
                Open connections
              </Link>
            </div>
          ) : null}
          {isReady && environments.length > 0 ? (
            <section aria-label="Scribe status" className="grid gap-3 sm:grid-cols-2">
              {environments.map((environment) => (
                <ScribeStatusCard
                  key={`${environment.environmentId}:${environment.connection.phase}`}
                  environment={environment}
                />
              ))}
            </section>
          ) : null}
          {!isReady || !bootstrapped ? (
            <div
              role="status"
              className="flex items-center gap-2 py-12 text-sm text-muted-foreground"
            >
              <Spinner /> Loading chat statuses…
            </div>
          ) : (
            <>
              {total === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>
                      {disconnected.length > 0
                        ? "No work in the saved statuses"
                        : "Nothing needs attention"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {environments.length === 0
                        ? "Connect a computer to see its AI work here."
                        : "Active work, permission requests and usage limits appear here by themselves."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}
              {SECTIONS.map(({ key, title, description, empty, Icon, tone }) => (
                <section key={key} aria-labelledby={`command-center-${key}`}>
                  <div className="mb-3 flex items-start gap-3">
                    <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone)} />
                    <div className="min-w-0 flex-1">
                      <h2 id={`command-center-${key}`} className="text-sm font-semibold">
                        {title}{" "}
                        <span className="ml-1 font-normal text-muted-foreground">
                          ({groups[key].length})
                        </span>
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                    </div>
                  </div>
                  {groups[key].length === 0 ? (
                    <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      {empty}
                    </p>
                  ) : (
                    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                      {groups[key].map(({ thread, status }) => {
                        const ref = scopeThreadRef(thread.environmentId, thread.id);
                        const environment = environmentById.get(thread.environmentId);
                        const stale = environment?.connection.phase !== "connected";
                        return (
                          <li key={scopedThreadKey(ref)}>
                            <Link
                              to="/$environmentId/$threadId"
                              params={buildThreadRouteParams(ref)}
                              title={`Open ${thread.title}`}
                              className="flex min-w-0 items-center gap-3 p-4 transition-colors hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {thread.title || "Untitled chat"}
                                </p>
                                <p className="mt-1 truncate text-xs text-muted-foreground">
                                  {projectNames.get(
                                    JSON.stringify([thread.environmentId, thread.projectId]),
                                  ) ?? "Unknown project"}{" "}
                                  · {environment?.label ?? thread.environmentId} ·{" "}
                                  {thread.runtime?.providerName ?? thread.providerInstanceId}
                                </p>
                                <p
                                  className={cn(
                                    "mt-2 text-xs",
                                    stale ? "text-muted-foreground" : tone,
                                  )}
                                >
                                  {STATUS_LABELS[status]}
                                  {stale ? " (saved status)" : ""}
                                </p>
                              </div>
                              <ArrowUpRightIcon
                                aria-hidden
                                className="size-4 shrink-0 text-muted-foreground"
                              />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              ))}
            </>
          )}
        </WorkspacePageContainer>
      </main>
    </SidebarInset>
  );
}

function CommandCenterPage() {
  const { scope } = useActiveAiosWorkspace();
  return (
    <TeamLensProvider scopeKey={JSON.stringify(scope)}>
      <CommandCenterBody />
    </TeamLensProvider>
  );
}

export const Route = createFileRoute("/_chat/command-center")({ component: CommandCenterPage });

import { createFileRoute, Link } from "@tanstack/react-router";
import { LayoutDashboardIcon } from "lucide-react";

import { WorkspacePageContainer } from "../components/WorkspacePageContainer";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { CommandCenterForward } from "../components/twoState/CommandCenterForward";
import { TeamLensProvider } from "../components/team/TeamLensContext";
import { useActiveAiosWorkspace } from "../components/workspace/useActiveAiosWorkspace";
import { HomeCardsOutlet } from "../components/twoState/SlotOutlet";
import { SidebarInset } from "../components/ui/sidebar";
import { isElectron } from "../env";
import { useEnvironments } from "../state/environments";

const HOME_CONTEXT = { forward: "cc" } as const;

/**
 * The Command Center home: the greeting and the Ask box, then 8 cards. Each card shows one live
 * number and opens its tab: see everything at a glance, jump anywhere.
 */
function CommandCenterPage() {
  const { scope } = useActiveAiosWorkspace();
  const { environments } = useEnvironments();
  const disconnected = environments.filter(
    (environment) => environment.connection.phase !== "connected",
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <WorkspacePageHeader electron={isElectron} className="border-b border-border">
        <LayoutDashboardIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <p className="truncate text-sm font-medium">Command Center</p>
      </WorkspacePageHeader>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <WorkspacePageContainer width="expanded" className="max-w-[96rem] px-4 min-[1440px]:px-8">
          <div data-tour="command-home">
            <CommandCenterForward />
          </div>
          <TeamLensProvider scopeKey={JSON.stringify(scope)}>
            <HomeCardsOutlet context={HOME_CONTEXT} />
          </TeamLensProvider>
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
                to="/settings/environments"
                className="mt-2 inline-block rounded-sm text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
              >
                Open connections
              </Link>
            </div>
          ) : null}
        </WorkspacePageContainer>
      </main>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/command-center")({ component: CommandCenterPage });

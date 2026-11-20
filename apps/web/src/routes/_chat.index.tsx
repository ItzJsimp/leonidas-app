import { RefreshIcon } from "~/components/ui/refresh-icon";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { LinkIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { isLocalEnvironmentDisabled } from "../localEnvironment";
import { isElectron } from "../env";
import { NoProjectsHero } from "../components/NoProjectsHero";
import { sortScopedProjectsForSidebar } from "../components/Sidebar.logic";
import { Button } from "../components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { SidebarInset } from "../components/ui/sidebar";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { useComposerDraftStore } from "../composerDraftStore";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useThreadShells,
} from "../state/entities";
import { useEnvironments } from "../state/environments";
import { APP_TITLE } from "~/branding";
import { hasCloudPublicConfig } from "~/cloud/publicConfig";
import { useWorkspaceProjects } from "../components/workspace/useWorkspaceProjects";

function ChatIndexRouteView() {
  const { authGateState } = Route.useRouteContext();
  const { guidePrompt } = Route.useSearch();
  const { environments, isReady } = useEnvironments();

  if (authGateState.status === "hosted-static") {
    if (!isReady) return null;
    if (environments.length === 0) return <HostedStaticOnboardingState />;
  }

  return <IndexDraftLanding guidePrompt={guidePrompt} />;
}

/**
 * Landing on the index route drops straight into a draft thread for the most
 * recently active project, so the first screen is a prompt instead of a dead
 * end. Falls back to an add-project hero when no project exists yet.
 */
function IndexDraftLanding({ guidePrompt }: { readonly guidePrompt?: string | undefined }) {
  const allProjects = useProjects();
  const projects = useWorkspaceProjects(allProjects);
  const threads = useThreadShells();
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const handleNewThread = useNewThreadHandler();
  const startingRef = useRef(false);
  const [startState, setStartState] = useState({ failed: false, retryRequest: 0 });

  const mostRecentProject = useMemo(
    () =>
      bootstrapped
        ? (sortScopedProjectsForSidebar(projects, threads, "updated_at")[0] ?? null)
        : null,
    [bootstrapped, projects, threads],
  );

  useEffect(() => {
    if (mostRecentProject === null || startingRef.current) {
      return;
    }
    startingRef.current = true;
    void handleNewThread(scopeProjectRef(mostRecentProject.environmentId, mostRecentProject.id), {
      replace: true,
    })
      .then((created) => {
        if (created && guidePrompt) {
          useComposerDraftStore.getState().setPrompt(created.draftId, guidePrompt);
        }
      })
      .catch(() => {
        startingRef.current = false;
        setStartState((state) => ({ ...state, failed: true }));
      });
  }, [guidePrompt, handleNewThread, mostRecentProject, startState.retryRequest]);

  if (!bootstrapped) {
    return null;
  }
  if (mostRecentProject !== null) {
    return startState.failed ? (
      <DraftStartError
        onRetry={() => {
          setStartState((state) => ({
            failed: false,
            retryRequest: state.retryRequest + 1,
          }));
        }}
      />
    ) : null;
  }
  // First-run routing to the welcome wizard happens in FirstRunGate at the
  // root, before this route ever renders.
  return <NoProjectsHero />;
}

function DraftStartError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <SidebarInset className="h-full min-h-0 overflow-hidden overscroll-y-none">
      {isElectron ? <WorkspacePageHeader electron /> : null}
      <Empty className="flex-1">
        <EmptyHeader className="max-w-md">
          <EmptyTitle>Could not start a new chat</EmptyTitle>
          <EmptyDescription>
            The project is still available. Try opening the draft again.
          </EmptyDescription>
          <div className="mt-5 flex justify-center">
            <Button size="sm" onClick={onRetry}>
              <RefreshIcon size="md" />
              Try again
            </Button>
          </div>
        </EmptyHeader>
      </Empty>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/")({
  validateSearch: (search: Record<string, unknown>): { guidePrompt?: string | undefined } => ({
    guidePrompt:
      typeof search.guidePrompt === "string" ? search.guidePrompt.slice(0, 1200) : undefined,
  }),
  // The app opens on the Command Center. Later visits to the chat start page stay here.
  beforeLoad: ({ search }) => {
    if (search.guidePrompt || !firstLandingThisSession()) return;
    throw redirect({ to: "/command-center", replace: true });
  },
  component: ChatIndexRouteView,
});

function HostedStaticOnboardingState() {
  const cloudEnabled = hasCloudPublicConfig();
  const localEnvironmentOff = isLocalEnvironmentDisabled();
  const description = localEnvironmentOff
    ? "This computer is turned off in Leonidas. Connect another computer, or turn this one back on in Connections."
    : cloudEnabled
      ? "Turn on remote access on that computer. Then open Connections here and sign in with the same account. You can also add the computer with a connection link."
      : "Open Connections and add that computer with its connection link. This app must be able to reach it.";

  return (
    <SidebarInset className="h-full min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <WorkspacePageHeader electron={isElectron} className="border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground md:text-muted-foreground/60">
              {APP_TITLE}
            </span>
          </div>
        </WorkspacePageHeader>

        <Empty className="flex-1">
          <div className="w-full max-w-xl rounded-3xl border border-border/55 bg-card/20 px-8 py-12 shadow-sm/5">
            <EmptyHeader className="max-w-none">
              <div className="mx-auto mb-5 flex size-11 items-center justify-center rounded-xl border border-border/70 bg-background/70 text-muted-foreground">
                <LinkIcon className="size-5" />
              </div>
              <EmptyTitle>Connect to a computer running Leonidas</EmptyTitle>
              <EmptyDescription>
                This app connects to Leonidas running on your computer or a server. Start the
                Leonidas desktop app or command-line server on that machine and keep it running.
              </EmptyDescription>
              <EmptyDescription>{description}</EmptyDescription>
              <div className="mt-6 flex justify-center">
                <Button render={<Link to="/settings/environments" />} size="sm">
                  <PlusIcon className="size-4" />
                  Open Connections
                </Button>
              </div>
            </EmptyHeader>
          </div>
        </Empty>
      </div>
    </SidebarInset>
  );
}

// Route options load with the route tree at app start, so this is the path the app opened on.
const START_PATH = typeof window === "undefined" ? null : window.location.pathname;
let startHandled = false;

/** True once: when the app opened on the chat start page. A reload there counts as opening. */
function firstLandingThisSession(): boolean {
  const first = !startHandled && START_PATH === "/";
  startHandled = true;
  return first;
}

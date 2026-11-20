import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { effectiveAiLevel } from "@t3tools/contracts";
import { GitBranchIcon, TriangleAlertIcon } from "lucide-react";
import * as Schema from "effect/Schema";
import { useEffect, useState } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";
import { localDay } from "~/onboarding/guidance.logic";
import { useActiveEnvironmentId, useProjects } from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { vcsEnvironment } from "~/state/vcs";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { DeveloperStrip } from "../windows/developer/DeveloperStrip";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { toastManager } from "../ui/toast";
import { GitLane } from "./GitLane";
import { GitLaneActions } from "./GitLaneActions";
import {
  backToMainGate,
  buildLane,
  mainBranchBanner,
  resolveWordsMode,
  type WordsMode,
} from "./gitLane.logic";

const WordsOverride = Schema.NullOr(Schema.Literals(["beginner", "advanced"]));

export function GitDashboardPage() {
  const projects = useProjects();
  const environmentId = useActiveEnvironmentId();
  const settings = useAtomValue(serverEnvironment.settingsValueAtom(environmentId as never));
  const [override, setOverride] = useLocalStorage("leonidas:git-words-mode", null, WordsOverride);
  const level =
    environmentId && settings
      ? effectiveAiLevel(settings.aiLevel, settings.aiLevelSince, localDay(new Date()))
      : null;
  const mode = resolveWordsMode(level, override);

  return (
    <SidebarInset className="h-full min-h-0 overflow-hidden overscroll-y-none isolate">
      <DeveloperStrip />
      <div className="scrollbar-gutter-both flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">Git</h1>
              <p className="text-sm text-muted-foreground">
                Where the work in each project is: in your folder, saved, and online.
              </p>
            </div>
            <ToggleGroup
              aria-label="Words"
              value={[mode]}
              onValueChange={(values) => {
                if (values[0] === "beginner" || values[0] === "advanced") setOverride(values[0]);
              }}
            >
              <Toggle value="beginner">Beginner</Toggle>
              <Toggle value="advanced">Advanced</Toggle>
            </ToggleGroup>
          </header>
          {projects.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No projects yet. Add a project and it shows up here.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {projects.map((project) => (
                <li key={`${project.environmentId}:${project.id}`}>
                  <ProjectGitCard
                    environmentId={project.environmentId}
                    title={project.title}
                    cwd={project.workspaceRoot}
                    mode={mode}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SidebarInset>
  );
}

function ProjectGitCard(props: {
  readonly environmentId: Parameters<typeof vcsEnvironment.status>[0]["environmentId"];
  readonly title: string;
  readonly cwd: string;
  readonly mode: WordsMode;
}) {
  // includeRemote:false reuses cached remote counts and starts no new refresh loop.
  const status = useEnvironmentQuery(
    vcsEnvironment.status({
      environmentId: props.environmentId,
      input: { cwd: props.cwd, includeRemote: false },
    }),
  );
  const switchRef = useAtomCommand(vcsEnvironment.switchRef, { reportFailure: false });
  const refreshStatus = useAtomCommand(vcsEnvironment.refreshStatus, { reportFailure: false });
  // One refresh when the card opens, so the counts are current. No timer.
  useEffect(() => {
    void refreshStatus({ environmentId: props.environmentId, input: { cwd: props.cwd } });
  }, [refreshStatus, props.environmentId, props.cwd]);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const data = status.data;
  const banner = data ? mainBranchBanner(data) : null;

  const backToMain = async () => {
    const gate = backToMainGate(data);
    if (!gate.allowed) {
      setRefusal(gate.reason);
      return;
    }
    setRefusal(null);
    setSwitching(true);
    // shortcut: assumes the default branch is named "main"; read it from refs if a repo differs.
    const result = await switchRef({
      environmentId: props.environmentId,
      input: { cwd: props.cwd, refName: "main" },
    });
    setSwitching(false);
    if (result._tag !== "Success" && !isAtomCommandInterrupted(result)) {
      toastManager.add({
        type: "error",
        title: "Could not go back to main",
        description: String(squashAtomCommandFailure(result)).includes(
          "branch_checked_out_in_worktree",
        )
          ? "Main is already open in another folder, so this folder cannot switch to it."
          : "Git could not switch this folder. Nothing was changed.",
      });
    }
  };

  return (
    <section className="rounded-2xl border bg-card/60 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="min-w-0 truncate text-base font-medium">{props.title}</h2>
        {data?.isRepo && data.refName ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <GitBranchIcon className="size-3" aria-hidden />
            {data.refName}
          </span>
        ) : null}
      </div>
      {banner ? (
        <div className="mb-3 rounded-xl border border-warning/40 bg-warning/10 p-3" role="status">
          <div className="flex items-start gap-2 text-sm">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
            <p className="min-w-0 flex-1">
              {banner.branch
                ? `This folder is on "${banner.branch}", not on main.`
                : "This folder is not on a branch."}{" "}
              <span className="text-muted-foreground">
                Main is the official copy. Check before you build on something else.
              </span>
            </p>
            <Button size="sm" variant="outline" disabled={switching} onClick={backToMain}>
              Back to main
            </Button>
          </div>
          {refusal ? (
            <p className="mt-2 text-sm text-warning-foreground" role="alert">
              {refusal}
            </p>
          ) : null}
        </div>
      ) : null}
      {data === null ? (
        <p className="text-sm text-muted-foreground">
          {status.error ? "Could not read this folder." : "Checking this folder..."}
        </p>
      ) : !data.isRepo ? (
        <p className="text-sm text-muted-foreground">
          This folder is not tracked by Git yet, so there is nothing to show.
        </p>
      ) : (
        <GitLane
          lane={buildLane(data)}
          mode={props.mode}
          renderActions={(stepId) => (
            <GitLaneActions
              key={stepId}
              stepId={stepId}
              scope={{ environmentId: props.environmentId, cwd: props.cwd }}
              status={data}
              mode={props.mode}
            />
          )}
        />
      )}
    </section>
  );
}

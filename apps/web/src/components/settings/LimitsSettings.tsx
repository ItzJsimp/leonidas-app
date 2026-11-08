import { useMemo } from "react";

import { CapEditor } from "~/components/taskBoard/CapEditor";
import { mergeTasks } from "~/components/taskBoard/taskBoard.logic";
import { buildRailEntries } from "~/components/taskBoard/tasksPage.logic";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { taskBoardWorkspaceQuery } from "~/state/taskBoard";

import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

/** Every limit the app enforces, each with its current value and an editor. */
export function LimitsSettings() {
  const environmentId = usePrimaryEnvironmentId();
  const { scope, scopeReady } = useActiveAiosWorkspace();
  const workspace = useEnvironmentQuery(
    environmentId && scopeReady ? taskBoardWorkspaceQuery({ environmentId, input: scope }) : null,
  );
  const { data, refresh } = workspace;
  const entries = useMemo(
    () =>
      buildRailEntries(mergeTasks(data?.tasks ?? [], []), data?.projects ?? []).filter(
        (entry) => entry.slug !== "general" && entry.cap !== undefined,
      ),
    [data],
  );

  return (
    <SettingsPageContainer>
      <SettingsSection title="Open tasks per project">
        <SettingsRow
          title="Inbox"
          description="Tasks with no project. This limit is fixed at 30."
        />
        {entries.map((entry) => (
          <SettingsRow
            key={entry.slug}
            title={entry.name}
            description={`${entry.open} open`}
            control={
              entry.cap === undefined ? undefined : (
                <CapEditor
                  environmentId={environmentId}
                  projectSlug={entry.slug}
                  cap={entry.cap}
                  warn={entry.warn ?? entry.cap}
                  open={entry.open}
                  saveOn="commit"
                  onSaved={refresh}
                />
              )
            }
          />
        ))}
        {data !== null && entries.length === 0 ? (
          <SettingsRow title="No projects yet" description="Projects with tasks show up here." />
        ) : null}
      </SettingsSection>
    </SettingsPageContainer>
  );
}

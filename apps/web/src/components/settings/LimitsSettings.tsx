import { useMemo } from "react";

import { CapEditor } from "~/components/taskBoard/CapEditor";
import { mergeTasks } from "~/components/taskBoard/taskBoard.logic";
import { buildRailEntries } from "~/components/taskBoard/tasksPage.logic";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { aiosLimitsQuery, taskBoardWorkspaceQuery, voiceLimitQuery } from "~/state/taskBoard";

import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { AiosLimitEditor } from "./AiosLimitEditor";
import { VoiceLimitEditor } from "./VoiceLimitEditor";

/** Every limit the app enforces, each with its current value and an editor. */
export function LimitsSettings() {
  const environmentId = usePrimaryEnvironmentId();
  const { scope, scopeReady } = useActiveAiosWorkspace();
  const workspace = useEnvironmentQuery(
    environmentId && scopeReady ? taskBoardWorkspaceQuery({ environmentId, input: scope }) : null,
  );
  const { data, refresh } = workspace;
  const limits = useEnvironmentQuery(
    environmentId && scopeReady ? aiosLimitsQuery({ environmentId, input: scope }) : null,
  );
  const voiceLimit = useEnvironmentQuery(
    environmentId ? voiceLimitQuery({ environmentId, input: {} }) : null,
  );
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
            description={`${entry.capOpen ?? entry.open} open`}
            control={
              entry.cap === undefined ? undefined : (
                <CapEditor
                  environmentId={environmentId}
                  projectSlug={entry.slug}
                  cap={entry.cap}
                  warn={entry.warn ?? entry.cap}
                  open={entry.capOpen ?? entry.open}
                  saveOn="commit"
                  onSaved={refresh}
                />
              )
            }
          />
        ))}
        <p className="px-3 py-2 text-xs text-muted-foreground sm:px-4">
          Press Enter or leave a field to save.
        </p>
        {data !== null && entries.length === 0 ? (
          <SettingsRow title="No projects yet" description="Projects with tasks show up here." />
        ) : null}
      </SettingsSection>
      <SettingsSection title="AIOS rules">
        {limits.isPending && limits.data === null ? (
          <SettingsRow title="Loading AIOS rules" />
        ) : null}
        {limits.error ? (
          <SettingsRow title="Could not load AIOS rules" description={limits.error} />
        ) : null}
        {limits.data?.length === 0 ? <SettingsRow title="No AIOS rules" /> : null}
        {limits.data?.map((limit) => (
          <SettingsRow
            key={limit.id}
            title={limit.label}
            description={limit.unit}
            control={
              <AiosLimitEditor
                environmentId={environmentId}
                limit={limit}
                onSaved={limits.refresh}
              />
            }
          />
        ))}
        {voiceLimit.data !== null ? (
          <SettingsRow
            title="Voice throttle per source"
            description="Seconds. Zero turns the throttle off."
            control={
              <VoiceLimitEditor
                environmentId={environmentId}
                seconds={voiceLimit.data}
                onSaved={voiceLimit.refresh}
              />
            }
          />
        ) : voiceLimit.error ? (
          <SettingsRow title="Voice throttle per source" description="Voice is unavailable." />
        ) : null}
      </SettingsSection>
    </SettingsPageContainer>
  );
}

import { Switch } from "~/components/ui/switch";
import { useRailShowAnyway } from "~/components/twoState/useRailShowAnyway";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";

import { SettingsRow, SettingsSection } from "./settingsLayout";

const BUSINESS_TAB_SWITCHES = [
  { id: "content", title: "Marketing" },
  { id: "deals", title: "Content" },
  { id: "team", title: "Team" },
] as const;

/** A business workspace shows these tabs. In any other workspace, one switch each brings a tab back. */
export function ShowTabsSection() {
  const { active } = useActiveAiosWorkspace();
  const { shown, toggle } = useRailShowAnyway(active?.id);
  if (active?.type === "business" || active?.type === "trading") return null;
  return (
    <SettingsSection id="appearance-tabs" title="Tabs">
      {BUSINESS_TAB_SWITCHES.map((tab) => (
        <SettingsRow
          key={tab.id}
          title={tab.title}
          description="Show in this workspace"
          control={
            <Switch
              checked={shown.includes(tab.id)}
              onCheckedChange={(checked) => toggle(tab.id, Boolean(checked))}
              aria-label={`Show ${tab.title} in this workspace`}
            />
          }
        />
      ))}
    </SettingsSection>
  );
}

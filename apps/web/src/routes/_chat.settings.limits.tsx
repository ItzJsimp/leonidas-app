import { createFileRoute } from "@tanstack/react-router";

import { LimitsSettings } from "../components/settings/LimitsSettings";

function SettingsLimitsRoute() {
  return <LimitsSettings />;
}

export const Route = createFileRoute("/_chat/settings/limits")({
  component: SettingsLimitsRoute,
});

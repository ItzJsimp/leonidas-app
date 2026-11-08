import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { AutomationsPage, type AutomationsView } from "../components/automations/AutomationsPage";

export interface AutomationsSearch {
  readonly view?: "machine";
  readonly id?: string;
}

function AutomationsRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/automations" });
  const view: AutomationsView = search.view === "machine" ? "machine" : "automations";
  return (
    <AutomationsPage
      view={view}
      selectedId={search.id}
      onView={(next) => void navigate({ search: next === "machine" ? { view: "machine" } : {} })}
      onSelect={(id) => void navigate({ search: id ? { id } : {}, replace: true })}
    />
  );
}

export const Route = createFileRoute("/_chat/automations")({
  validateSearch: (raw: Record<string, unknown>): AutomationsSearch => ({
    ...(raw.view === "machine" ? { view: "machine" as const } : {}),
    ...(typeof raw.id === "string" && raw.id.trim() ? { id: raw.id } : {}),
  }),
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: AutomationsRoute,
});

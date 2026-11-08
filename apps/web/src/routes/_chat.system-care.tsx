import { createFileRoute, redirect } from "@tanstack/react-router";

// System Care is now the Machine view of the Automations tab (Batch 16).
export const Route = createFileRoute("/_chat/system-care")({
  beforeLoad: () => {
    throw redirect({ to: "/automations", search: { view: "machine" }, replace: true });
  },
});

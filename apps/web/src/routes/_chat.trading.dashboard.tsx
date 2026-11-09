import { createFileRoute } from "@tanstack/react-router";

import { TradingEmpty } from "../components/trading/TradingEmpty";

export const Route = createFileRoute("/_chat/trading/dashboard")({
  component: () => (
    <TradingEmpty
      title="Dashboard"
      line="Your Evaluations, Payouts and Total cost show here once you add an account."
      action={{ label: "Add an account", to: "/trading/accounts" }}
    />
  ),
});

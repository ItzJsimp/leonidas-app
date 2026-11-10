import { createFileRoute } from "@tanstack/react-router";

import { TradingEmpty } from "../components/trading/TradingEmpty";

export const Route = createFileRoute("/_chat/trading/risk")({
  component: () => (
    <TradingEmpty
      title="Risk"
      line="Your daily loss limit shows here for each account."
      action={{ label: "Add an account", to: "/trading/accounts" }}
    />
  ),
});

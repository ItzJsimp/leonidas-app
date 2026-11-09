import { createFileRoute } from "@tanstack/react-router";

import { TradingEmpty } from "../components/trading/TradingEmpty";

export const Route = createFileRoute("/_chat/trading/money")({
  component: () => (
    <TradingEmpty
      title="Money"
      line="Firm fees, Payouts and Total cost show here."
      action={{ label: "See your accounts", to: "/trading/accounts" }}
    />
  ),
});

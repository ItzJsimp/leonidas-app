import { createFileRoute } from "@tanstack/react-router";

import { TradingEmpty } from "../components/trading/TradingEmpty";

export const Route = createFileRoute("/_chat/trading/accounts")({
  component: () => (
    <TradingEmpty
      title="Accounts"
      line="Each Evaluation and Funded account shows here, with its Attempts."
      action={{ label: "Add one in chat", to: "/" }}
    />
  ),
});

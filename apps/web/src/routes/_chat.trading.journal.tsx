import { createFileRoute } from "@tanstack/react-router";

import { TradingEmpty } from "../components/trading/TradingEmpty";

export const Route = createFileRoute("/_chat/trading/journal")({
  component: () => (
    <TradingEmpty
      title="Journal"
      line="Each trade you log shows here, with what you learned from it."
      action={{ label: "Log a trade in chat", to: "/" }}
    />
  ),
});

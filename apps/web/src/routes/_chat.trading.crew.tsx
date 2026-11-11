import { createFileRoute } from "@tanstack/react-router";

import { TradingEmpty } from "../components/trading/TradingEmpty";

export const Route = createFileRoute("/_chat/trading/crew")({
  component: () => (
    <TradingEmpty
      title="Crew"
      line="Your Crew board shows here once your Crew is set up."
      action={{ label: "Ask Leonidas about it", to: "/" }}
    />
  ),
});

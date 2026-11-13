import { createFileRoute } from "@tanstack/react-router";

import { HomeChat } from "../components/home/HomeChat";

export const Route = createFileRoute("/_chat/home")({
  component: HomeChat,
});

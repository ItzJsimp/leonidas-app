import { createFileRoute } from "@tanstack/react-router";

import { MeetingsPage } from "../components/meetings/MeetingsPage";

export const Route = createFileRoute("/_chat/meetings")({ component: MeetingsPage });

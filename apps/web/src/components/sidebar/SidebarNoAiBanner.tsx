import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import { TriangleAlertIcon } from "lucide-react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { primaryEnvironmentIdAtom } from "../../state/primaryEnvironment";
import { primaryServerProvidersAtom } from "../../state/server";
import { Button } from "../ui/button";
import { shouldShowNoAiBanner } from "./noAiBanner.logic";

/** Shown while no AI account works. Fix reopens setup at the AI step. */
export function SidebarNoAiBanner() {
  const navigate = useNavigate();
  const providers = useAtomValue(primaryServerProvidersAtom);
  const environmentId = useAtomValue(primaryEnvironmentIdAtom);
  const nowMinute = useNowMinute();
  if (environmentId === null || !shouldShowNoAiBanner(providers, Date.parse(`${nowMinute}:00Z`)))
    return null;
  return (
    <div
      role="status"
      className="mx-2 mb-2 flex items-center gap-2 rounded-lg bg-warning/12 px-3 py-2 text-xs text-warning"
    >
      <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">No AI is ready. Chats cannot start.</span>
      <Button
        size="xs"
        variant="outline"
        onClick={() => void navigate({ to: "/welcome", hash: `agents:${environmentId}` })}
      >
        Fix
      </Button>
    </div>
  );
}

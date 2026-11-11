import type { RunId } from "@t3tools/contracts";
import { RotateCcwIcon } from "lucide-react";
import { use } from "react";
import { Button } from "../ui/button";
import { TimelineRowCtx } from "./TimelineRowContext";

export function RetryRunButton({ runId }: { runId: RunId | null }) {
  const { onRetryRun } = use(TimelineRowCtx);
  if (runId === null || !onRetryRun) return null;
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onRetryRun(runId);
      }}
    >
      <RotateCcwIcon aria-hidden />
      Retry
    </Button>
  );
}

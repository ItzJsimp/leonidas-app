import { Link } from "@tanstack/react-router";

import { ProgressBar } from "~/components/commandCenter/charts";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import {
  EMPTY_SETUP_STATE,
  SETUP_STATE_STORAGE_KEY,
  SetupStateSchema,
  setupResumeSummary,
} from "~/onboarding/setupState.logic";

/**
 * Resume row at the top of the rail. It shows while setup has items left, so a skipped step is one
 * click away. Only people who ran the new setup see it (`startedAt`).
 */
export function FinishSetupRow({ compact = false }: { readonly compact?: boolean }) {
  const [setup] = useLocalStorage(SETUP_STATE_STORAGE_KEY, EMPTY_SETUP_STATE, SetupStateSchema);
  const summary = setupResumeSummary(setup);
  if (summary === null) return null;
  const { done, total } = summary;
  if (compact) {
    // Fits the narrow rail with names under the icons.
    return (
      <Link
        to="/command-center"
        aria-label={`Finish setup, ${done} of ${total} done`}
        className="flex w-16 shrink-0 flex-col gap-1 rounded-lg border border-border bg-surface-raised px-1.5 py-1.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex items-center justify-between text-3xs leading-none font-medium">
          Setup
          <span className="text-muted-foreground tabular-nums">
            {done}/{total}
          </span>
        </span>
        <ProgressBar percent={Math.round((done / total) * 100)} label="Setup progress" />
      </Link>
    );
  }
  return (
    <Link
      to="/command-center"
      className="mx-0.5 flex flex-col gap-1.5 rounded-lg border border-border bg-surface-raised px-2.5 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex items-center justify-between text-xs font-medium">
        Finish setup
        <span className="text-muted-foreground tabular-nums">
          {done} of {total}
        </span>
      </span>
      <ProgressBar percent={Math.round((done / total) * 100)} label="Setup progress" />
    </Link>
  );
}

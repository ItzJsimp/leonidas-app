import { RefreshCwIcon } from "lucide-react";

import { cn } from "~/lib/utils";

import { updatedLabel } from "../commandCenter/commandCenter.logic";
import { useNowMs, useUpdatedAt } from "../commandCenter/useHomeReads";
import { greetingFor } from "./copy";
import { Tip } from "./Tip";
import { useAiosHome } from "./useTwoStateData";

/** State 1: the greeting with the date and the last read. The Ask box sits under the cards. */
export function CommandCenterForward() {
  const home = useAiosHome();
  const updatedAt = useUpdatedAt();
  const now = useNowMs();
  const date = new Date(now);
  return (
    <div className="min-w-0">
      <h1 className="font-display text-3xl leading-tight font-bold tracking-tight">
        {greetingFor(date)}
      </h1>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
        <span>
          {date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          {" · "}
          {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <span aria-hidden>·</span>
        <Tip text="Reads your AIOS folder again. This is when the newest data on this page was read.">
          <button
            type="button"
            onClick={home.refresh}
            className="inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            <RefreshCwIcon
              aria-hidden
              className={cn("size-3.5", home.isPending && "motion-safe:animate-spin")}
            />
            {updatedLabel(updatedAt, now)}
          </button>
        </Tip>
      </p>
    </div>
  );
}

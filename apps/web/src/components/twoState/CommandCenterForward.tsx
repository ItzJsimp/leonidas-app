import { RefreshCwIcon } from "lucide-react";

import { cn } from "~/lib/utils";

import { HomeComposer } from "../commandCenter/HomeComposer";
import { updatedLabel } from "../commandCenter/commandCenter.logic";
import { useNowMs, useUpdatedAt } from "../commandCenter/useHomeReads";
import { useCodeForward } from "./codeForwardContext";
import { greetingFor } from "./copy";
import { Tip } from "./Tip";
import { useAiosHome } from "./useTwoStateData";

/** State 1: the greeting with the date and the last read, and the Ask box beside it. */
export function CommandCenterForward() {
  const { chatBeside } = useCodeForward();
  const home = useAiosHome();
  const updatedAt = useUpdatedAt();
  const now = useNowMs();
  const date = new Date(now);
  return (
    <div className="@container">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
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
        {/* One composer per screen: in the split the chat pane has it. */}
        {chatBeside ? null : (
          <div className="w-full @4xl:w-[min(36rem,50%)]">
            <HomeComposer />
          </div>
        )}
      </div>
    </div>
  );
}

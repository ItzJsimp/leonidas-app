import * as Schema from "effect/Schema";
import { XIcon } from "lucide-react";
import { useState } from "react";

import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";

import { Button } from "../ui/button";
import { openNewAiosProject } from "../workspace/newAiosProjectStore";
import { useIsAiosRoot } from "../workspace/useAiosProjectRoot";

const DISMISSED_KEY = "leonidas:aios-root-nudge-dismissed";

/**
 * The card above the composer on a new chat that starts in the whole AIOS folder (Doop "New chat ·
 * AIOS hint · your pick"). It teaches what a project folder is and offers the two ways to get one.
 */
export function AiosRootNudge(props: {
  /** The folder the new chat starts in; null when it has no project folder. */
  readonly projectRoot: string | null;
  /** False when the AIOS has no other project to pick. */
  readonly canPick: boolean;
  readonly onPick: () => void;
}) {
  const onAiosRoot = useIsAiosRoot(props.projectRoot);
  const [dismissed, setDismissed] = useState(
    () => getLocalStorageItem(DISMISSED_KEY, Schema.Boolean) === true,
  );
  if (dismissed || !onAiosRoot) return null;
  return (
    <div
      role="note"
      className="pointer-events-auto mt-6 flex w-full flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-card py-3.5 pr-3.5 pl-4 text-left"
    >
      <div className="min-w-0 flex-1 basis-60">
        <p className="font-semibold text-sm">Working on one topic?</p>
        <p className="mt-0.5 text-muted-foreground text-xs/relaxed">
          This chat reads your whole AIOS. A project folder holds the goal, rules and notes for one
          topic, so the agent reads less and answers better.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {props.canPick ? (
          <Button size="xs" variant="outline" onClick={props.onPick}>
            Pick a project
          </Button>
        ) : null}
        <Button size="xs" onClick={openNewAiosProject}>
          New project
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Hide this hint"
          onClick={() => {
            setLocalStorageItem(DISMISSED_KEY, true, Schema.Boolean);
            setDismissed(true);
          }}
        >
          <XIcon aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/** One more line in the project-name tooltip when the chat starts in the whole AIOS folder. */
export function AiosRootTip(props: { readonly projectRoot: string | null }) {
  const onAiosRoot = useIsAiosRoot(props.projectRoot);
  if (!onAiosRoot) return null;
  return (
    <span className="mt-0.5 block max-w-64 text-muted-foreground">
      This chat reads your whole AIOS. A project folder gives better answers for less.
    </span>
  );
}

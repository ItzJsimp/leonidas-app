import type { EnvironmentId } from "@t3tools/contracts";
import { MicOffIcon } from "lucide-react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { scribeLive } from "~/state/scribe";
import { cn } from "~/lib/utils";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Switch } from "../ui/switch";
import { Tip } from "../twoState/Tip";
import { useBuilderMode } from "../twoState/useBuilderMode";
import { WindowHeader } from "../twoState/WindowHeader";
import { ScribeDictionaryTab } from "./ScribeDictionaryTab";
import { ScribeHomeTab } from "./ScribeHomeTab";
import { ScribeProgressTab } from "./ScribeProgressTab";
import { ScribeRewriteTab } from "./ScribeRewriteTab";
import { ScribeSettingsTab } from "./ScribeSettingsTab";
import { ScribeTranscriptsTab } from "./ScribeTranscriptsTab";
import { INITIAL_SCRIBE_LIVE, engineStrip, type ScribeLiveSnapshot } from "./scribeLive.logic";
import { useScribeToggle } from "./useScribeToggle";

export interface ScribeTabProps {
  readonly environmentId: EnvironmentId;
  readonly live: ScribeLiveSnapshot;
}

/** Only built tabs appear. Each later tab adds one row here. */
const TABS = [
  { id: "home", label: "Home", render: ScribeHomeTab },
  { id: "transcripts", label: "Transcripts", render: ScribeTranscriptsTab },
  { id: "dictionary", label: "Dictionary", render: ScribeDictionaryTab },
  { id: "rewrite", label: "Rewrite", render: ScribeRewriteTab },
  { id: "progress", label: "Progress", render: ScribeProgressTab },
  { id: "settings", label: "Settings", render: ScribeSettingsTab },
] as const;

export type ScribeTabId = (typeof TABS)[number]["id"];

export function isScribeTabId(value: unknown): value is ScribeTabId {
  return TABS.some((tab) => tab.id === value);
}

/** Old links: Goals and Insights became Progress. Meetings has its own page, so it opens Home. */
export function scribeTabFromSearch(value: unknown): ScribeTabId | undefined {
  if (value === "goals" || value === "insights") return "progress";
  return isScribeTabId(value) ? value : undefined;
}

const STATUS_DOT = {
  success: "bg-state",
  info: "bg-state animate-pulse motion-reduce:animate-none",
  warning: "bg-warning",
  error: "bg-error",
  muted: "bg-muted-foreground",
} as const;

export function ScribePage(props: {
  readonly tab: ScribeTabId;
  readonly onTabChange: (tab: ScribeTabId) => void;
}) {
  const environmentId = usePrimaryEnvironmentId();
  return (
    <div className="isolate flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden overscroll-y-none">
      {environmentId ? (
        <ScribeBody environmentId={environmentId} {...props} />
      ) : (
        <>
          <WindowHeader title="Scribe" />
          <div className="min-h-0 flex-1 overflow-y-auto bg-background p-4 sm:p-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MicOffIcon />
                </EmptyMedia>
                <EmptyTitle>No server connected</EmptyTitle>
                <EmptyDescription>
                  Scribe runs on the Leonidas server. Connect to a server to see it.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </>
      )}
    </div>
  );
}

function ScribeBody(props: {
  readonly environmentId: EnvironmentId;
  readonly tab: ScribeTabId;
  readonly onTabChange: (tab: ScribeTabId) => void;
}) {
  const live =
    useEnvironmentQuery(scribeLive({ environmentId: props.environmentId, input: {} })).data ??
    INITIAL_SCRIBE_LIVE;
  const { enabled, busy, toggle } = useScribeToggle(props.environmentId);
  const builder = useBuilderMode();
  const strip = engineStrip(live, builder, enabled ?? true);
  const active = TABS.find((tab) => tab.id === props.tab) ?? TABS[0];
  const Tab = active.render;
  const switchDisabled = live.connected !== true || enabled === null || busy;
  const switchTip =
    live.connected !== true
      ? "Scribe engine is not running."
      : enabled === false
        ? "Turn Leonidas Scribe on to enable dictation shortcuts."
        : "Turn Leonidas Scribe off to stop all dictation shortcuts.";

  return (
    <>
      <WindowHeader
        title="Scribe"
        actions={
          <div className="flex items-center gap-3">
            <span
              aria-live="polite"
              className="inline-flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span aria-hidden className={cn("size-2 rounded-full", STATUS_DOT[strip.tone])} />
              {strip.label}
            </span>
            <Tip text={switchTip}>
              <Switch
                size="sm"
                aria-label="Enable Leonidas Scribe"
                checked={enabled ?? false}
                disabled={switchDisabled}
                onCheckedChange={() => void toggle()}
              />
            </Tip>
          </div>
        }
        tabs={TABS}
        active={active.id}
        onSelect={(id) => {
          if (isScribeTabId(id)) props.onTabChange(id);
        }}
        idBase="scribe"
      />
      <div
        role="tabpanel"
        id="scribe-panel"
        aria-labelledby={`scribe-tab-${active.id}`}
        className="min-h-0 flex-1 overflow-y-auto bg-background scrollbar-gutter-both"
      >
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 p-4 sm:p-6">
          <Tab environmentId={props.environmentId} live={live} />
        </div>
      </div>
    </>
  );
}

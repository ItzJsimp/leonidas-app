import type { EnvironmentId } from "@t3tools/contracts";
import { MicOffIcon } from "lucide-react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { scribeLive } from "~/state/scribe";
import { Badge } from "../ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { SidebarInset } from "../ui/sidebar";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { ScribeDictionaryTab } from "./ScribeDictionaryTab";
import { ScribeHomeTab } from "./ScribeHomeTab";
import { ScribeRewriteTab } from "./ScribeRewriteTab";
import { ScribeSettingsTab } from "./ScribeSettingsTab";
import { ScribeTranscriptsTab } from "./ScribeTranscriptsTab";
import { INITIAL_SCRIBE_LIVE, engineStrip, type ScribeLiveSnapshot } from "./scribeLive.logic";

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
  { id: "settings", label: "Settings", render: ScribeSettingsTab },
] as const;

export type ScribeTabId = (typeof TABS)[number]["id"];

export function isScribeTabId(value: unknown): value is ScribeTabId {
  return TABS.some((tab) => tab.id === value);
}

export function ScribePage(props: {
  readonly tab: ScribeTabId;
  readonly onTabChange: (tab: ScribeTabId) => void;
}) {
  const environmentId = usePrimaryEnvironmentId();
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background scrollbar-gutter-both">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 p-4 max-md:pt-14 sm:p-6">
          {environmentId ? (
            <ScribeBody environmentId={environmentId} {...props} />
          ) : (
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
          )}
        </div>
      </div>
    </SidebarInset>
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
  const strip = engineStrip(live);
  const active = TABS.find((tab) => tab.id === props.tab) ?? TABS[0];
  const Tab = active.render;
  return (
    <>
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Scribe</h1>
          <Badge
            variant={strip.tone === "muted" ? "outline" : strip.tone}
            size="lg"
            aria-live="polite"
          >
            {strip.label}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Speak instead of typing, and rewrite any text you select.
        </p>
      </header>

      {TABS.length > 1 ? (
        // Scrolls sideways on a narrow screen, so more tabs can join the strip.
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
          <ToggleGroup
            aria-label="Scribe pages"
            className="w-max min-w-full *:shrink-0 *:flex-1 *:pointer-coarse:min-h-11 sm:min-w-0 sm:*:min-w-24"
            value={[active.id]}
            onValueChange={(next) => {
              const tab = next[0];
              if (isScribeTabId(tab)) props.onTabChange(tab);
            }}
          >
            {TABS.map((tab) => (
              <Toggle key={tab.id} value={tab.id}>
                {tab.label}
              </Toggle>
            ))}
          </ToggleGroup>
        </div>
      ) : null}

      <Tab environmentId={props.environmentId} live={live} />
    </>
  );
}

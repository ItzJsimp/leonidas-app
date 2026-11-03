import type { ProviderInstanceId } from "@t3tools/contracts";
import type { AutoRoutePreference } from "@t3tools/contracts/settings";
import {
  AUTO_ROUTE_PREFERENCES,
  rankModelsForPreference,
  type AutoRouteCandidate,
  type BenchmarkRouteProfiles,
} from "@t3tools/shared/autoRouter";
import { RouteIcon } from "lucide-react";
import { useMemo } from "react";

import { Toggle, ToggleGroup } from "../ui/toggle-group";

const SHORT_LABELS: Record<AutoRoutePreference, string> = {
  balanced: "Balanced",
  cost: "Cost",
  quality: "Quality",
  speed: "Speed",
};

const RANK_HEADINGS: Record<AutoRoutePreference, string> = {
  balanced: "Best all-round right now",
  cost: "Cheapest right now, free first",
  quality: "Highest quality right now",
  speed: "Fastest right now",
};

/** Quality, speed and cost scores for every goal, with the goal's own score first. */
function formatProfileScores(
  preference: AutoRoutePreference,
  profile: { quality: number; speed: number; economy: number },
): string {
  const scores = {
    quality: `Q${profile.quality}`,
    speed: `S${profile.speed}`,
    cost: `C${profile.economy}`,
  };
  const order: ReadonlyArray<keyof typeof scores> =
    preference === "quality"
      ? ["quality", "speed", "cost"]
      : preference === "speed"
        ? ["speed", "quality", "cost"]
        : preference === "cost"
          ? ["cost", "quality", "speed"]
          : ["quality", "speed", "cost"];
  return order.map((key) => scores[key]).join(" ");
}

/**
 * Top of the model picker. Choosing a goal lets the composer pick a model per
 * message from the connected providers, and lists the top models for that goal
 * so one can be pinned by hand instead; picking a model turns the autorouter off.
 */
export function AutoRouterPickerSection(props: {
  preference: AutoRoutePreference | null;
  candidates: ReadonlyArray<AutoRouteCandidate>;
  profiles?: BenchmarkRouteProfiles | undefined;
  onPreferenceChange: (preference: AutoRoutePreference | null) => void;
  onPickModel: (instanceId: ProviderInstanceId, model: string) => void;
}) {
  const { preference, candidates } = props;
  const ranked = useMemo(
    () =>
      preference === null
        ? []
        : rankModelsForPreference({
            preference,
            candidates,
            now: Date.now(),
            limit: 5,
            profiles: props.profiles,
          }),
    [preference, candidates, props.profiles],
  );
  return (
    <div
      className="flex max-w-[calc(100vw-1rem)] flex-col gap-1.5 border-b px-3 py-2.5"
      data-auto-router-section="true"
    >
      <div className="flex items-center gap-1.5 text-xs">
        <RouteIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium">Leonidas Autorouter</span>
        <span className="truncate text-muted-foreground">
          {preference === null ? "Off" : "Picks a model for each message"}
        </span>
      </div>
      <ToggleGroup
        aria-label="What the autorouter should favor"
        // The five choices must fit a 320 px screen: they may shrink, with less side padding there.
        className="w-full *:min-w-0 *:flex-1 max-sm:*:px-1.5"
        value={[preference ?? "off"]}
        onValueChange={(next) => {
          const value = next[0];
          if (value === undefined) return;
          props.onPreferenceChange(AUTO_ROUTE_PREFERENCES.find((entry) => entry === value) ?? null);
        }}
      >
        <Toggle value="off">Off</Toggle>
        {AUTO_ROUTE_PREFERENCES.map((entry) => (
          <Toggle key={entry} value={entry}>
            {SHORT_LABELS[entry]}
          </Toggle>
        ))}
      </ToggleGroup>
      {preference !== null && ranked.length > 0 ? (
        <div className="flex flex-col gap-0.5" data-auto-router-ranking={preference}>
          <span className="text-muted-foreground text-xs">{RANK_HEADINGS[preference]}</span>
          {ranked.map((entry, index) => (
            <button
              key={`${entry.instanceId}:${entry.slug}`}
              type="button"
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent"
              onClick={() => props.onPickModel(entry.instanceId, entry.slug)}
            >
              <span className="w-3 shrink-0 text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                {entry.name}
                <span className="text-muted-foreground"> · {entry.providerLabel}</span>
              </span>
              <span className="shrink-0 text-muted-foreground">
                {entry.free ? "Free · " : ""}
                {formatProfileScores(preference, entry.profile)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

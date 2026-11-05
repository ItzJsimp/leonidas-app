import type { EnvironmentId, TaskBoardHomeWeather } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import {
  CloudDrizzleIcon,
  CloudFogIcon,
  CloudIcon,
  CloudLightningIcon,
  CloudRainIcon,
  CloudSnowIcon,
  CloudSunIcon,
  ExternalLinkIcon,
  MoonIcon,
  NewspaperIcon,
  PlusIcon,
  SunIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { taskBoardHomeNewsQuery, taskBoardHomeWeatherQuery } from "~/state/taskBoard";

const HomeExtras = Schema.Struct({
  weather: Schema.Boolean,
  place: Schema.String,
  news: Schema.Boolean,
});
type HomeExtras = typeof HomeExtras.Type;
const DEFAULT_EXTRAS: HomeExtras = { weather: false, place: "", news: false };

const WEATHER_ICONS: Record<string, LucideIcon> = {
  sun: SunIcon,
  moon: MoonIcon,
  "cloud-sun": CloudSunIcon,
  cloud: CloudIcon,
  "cloud-fog": CloudFogIcon,
  "cloud-drizzle": CloudDrizzleIcon,
  "cloud-rain": CloudRainIcon,
  "cloud-snow": CloudSnowIcon,
  "cloud-lightning": CloudLightningIcon,
};

/** Optional Home cards: off until the user adds them; the choice and city stay on this device. */
export function HomeExtraCards() {
  const environmentId = usePrimaryEnvironmentId();
  const [extras, setExtras] = useLocalStorage("leonidas:home-extras", DEFAULT_EXTRAS, HomeExtras);
  const update = (patch: Partial<HomeExtras>) => setExtras((current) => ({ ...current, ...patch }));

  return (
    <>
      {extras.weather || extras.news ? (
        <div className="grid items-start gap-3 md:grid-cols-2">
          {extras.weather ? (
            <WeatherCard
              environmentId={environmentId}
              place={extras.place}
              onPlace={(place) => update({ place })}
              onHide={() => update({ weather: false })}
            />
          ) : null}
          {extras.news ? (
            <NewsCard environmentId={environmentId} onHide={() => update({ news: false })} />
          ) : null}
        </div>
      ) : null}
      {!extras.weather || !extras.news ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Extra cards you can add:</span>
          {!extras.weather ? (
            <Button size="xs" variant="outline" onClick={() => update({ weather: true })}>
              <PlusIcon aria-hidden /> Weather
            </Button>
          ) : null}
          {!extras.news ? (
            <Button size="xs" variant="outline" onClick={() => update({ news: true })}>
              <PlusIcon aria-hidden /> AI news
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function CardShell(props: {
  readonly label: string;
  readonly onHide: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <section aria-label={props.label} className="rounded-lg border border-border p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {props.label}
        </p>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={props.onHide}
          aria-label={`Hide ${props.label}`}
        >
          <XIcon aria-hidden />
        </Button>
      </div>
      {props.children}
    </section>
  );
}

function PlaceForm(props: { readonly initial: string; readonly onSave: (place: string) => void }) {
  const [draft, setDraft] = useState(props.initial);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim()) props.onSave(draft.trim());
  };
  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Your city, for example Tucson"
        aria-label="City for weather"
        maxLength={80}
        size="sm"
      />
      <Button size="sm" type="submit" disabled={!draft.trim()}>
        Save
      </Button>
    </form>
  );
}

function WeatherCard(props: {
  readonly environmentId: EnvironmentId | null;
  readonly place: string;
  readonly onPlace: (place: string) => void;
  readonly onHide: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const query = useEnvironmentQuery(
    props.environmentId && props.place && !editing
      ? taskBoardHomeWeatherQuery({
          environmentId: props.environmentId,
          input: { place: props.place },
        })
      : null,
  );
  const save = (place: string) => {
    setEditing(false);
    props.onPlace(place);
  };

  if (!props.place || editing) {
    return (
      <CardShell label="Weather" onHide={props.onHide}>
        <p className="mb-2 text-sm text-muted-foreground">Which city should the weather show?</p>
        <PlaceForm initial={props.place} onSave={save} />
      </CardShell>
    );
  }
  const weather = query.data;
  return (
    <CardShell label="Weather" onHide={props.onHide}>
      {weather === null ? (
        <p className="text-sm text-muted-foreground">
          {query.error ? "Weather is not available now. Try again later." : "Loading weather..."}
        </p>
      ) : weather.status === "unavailable" ? (
        <p className="text-sm text-muted-foreground">
          {weather.reason === "place_not_found"
            ? `Could not find "${props.place}". Try another spelling.`
            : "Weather is not available now. Try again later."}
        </p>
      ) : (
        <WeatherReading weather={weather} />
      )}
      <Button size="xs" variant="link" className="mt-2 px-0" onClick={() => setEditing(true)}>
        Change city
      </Button>
    </CardShell>
  );
}

function WeatherReading({
  weather,
}: {
  weather: Extract<TaskBoardHomeWeather, { status: "available" }>;
}) {
  const Icon = WEATHER_ICONS[weather.icon] ?? CloudIcon;
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-muted-foreground">{weather.place}</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">
            {weather.temp}°{weather.unit}
          </span>
          <span className="text-sm text-muted-foreground">{weather.condition}</span>
        </p>
        <p className="mt-1 text-xs tabular-nums text-muted-foreground">
          Feels {weather.feels}° · H {weather.high}° / L {weather.low}°
        </p>
      </div>
      <Icon aria-hidden className="size-8 shrink-0 text-muted-foreground" />
    </div>
  );
}

function NewsCard(props: {
  readonly environmentId: EnvironmentId | null;
  readonly onHide: () => void;
}) {
  const query = useEnvironmentQuery(
    props.environmentId
      ? taskBoardHomeNewsQuery({ environmentId: props.environmentId, input: {} })
      : null,
  );
  const items = query.data?.items ?? null;
  return (
    <CardShell label="In AI today" onHide={props.onHide}>
      {items === null ? (
        <p className="text-sm text-muted-foreground">
          {query.error ? "News is not available now. Try again later." : "Loading headlines..."}
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Could not load AI headlines. Try again later.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <li key={item.link} className="py-2 first:pt-0 last:pb-0">
              <a
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="group flex items-start gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-foreground/30"
              >
                <NewspaperIcon
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0">
                  <span className="line-clamp-2 text-sm font-medium group-hover:underline">
                    {item.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{item.source}</span>
                </span>
                <ExternalLinkIcon
                  aria-hidden
                  className="ml-auto mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

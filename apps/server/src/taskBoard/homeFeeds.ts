// @effect-diagnostics globalFetch:off globalDate:off - two keyless public reads with a plain TTL cache; never throws.
import type { TaskBoardHomeNewsItem, TaskBoardHomeWeather } from "@t3tools/contracts";

const FETCH_TIMEOUT_MS = 10_000;
const WEATHER_TTL_MS = 10 * 60_000;
const NEWS_TTL_MS = 15 * 60_000;
const NEWS_LIMIT = 5;
const PER_SOURCE_LIMIT = 2;

// Public AI feeds, newest first. Add or remove a feed here.
const FEEDS = [
  { source: "The Verge", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { source: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { source: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/technology-lab" },
] as const;

// WMO weather codes (Open-Meteo) to a plain word and a lucide icon name.
const WMO: ReadonlyArray<readonly [ReadonlyArray<number>, string, string]> = [
  [[0], "Clear", "sun"],
  [[1], "Mostly clear", "sun"],
  [[2], "Partly cloudy", "cloud-sun"],
  [[3], "Overcast", "cloud"],
  [[45, 48], "Fog", "cloud-fog"],
  [[51, 53, 55, 56, 57], "Drizzle", "cloud-drizzle"],
  [[61, 63, 65, 66, 67, 80, 81, 82], "Rain", "cloud-rain"],
  [[71, 73, 75, 77, 85, 86], "Snow", "cloud-snow"],
  [[95, 96, 99], "Thunderstorm", "cloud-lightning"],
];

// Countries that read temperatures in Fahrenheit.
const FAHRENHEIT = new Set(["US", "LR", "MM", "BS", "BZ", "KY", "PW", "FM", "MH"]);

export function describeWeather(code: number, isDay: boolean) {
  const hit = WMO.find(([codes]) => codes.includes(code));
  const icon = hit?.[2] ?? "cloud";
  return { condition: hit?.[1] ?? "Unknown", icon: !isDay && icon === "sun" ? "moon" : icon };
}

const ENTITY: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
const decode = (text: string) =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&(\w+);/g, (match, name: string) => ENTITY[name] ?? match)
    // Feeds often escape their HTML (&lt;p&gt;), so strip tags again once entities are decoded.
    .replace(/<[^>]+>/g, "")
    .trim();

/** Just enough RSS or Atom for headlines: title, link, date and the first image an item carries. */
export function parseFeed(xml: string, source: string): TaskBoardHomeNewsItem[] {
  const items = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/g) ?? [];
  return items
    .map((item) => {
      const tag = (name: string) =>
        new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(item)?.[1] ?? "";
      const link = /<link\b[^>]*href="([^"]+)"/.exec(item)?.[1] ?? decode(tag("link"));
      const image =
        /<media:(?:content|thumbnail)\b[^>]*url="([^"]+)"/.exec(item)?.[1] ??
        /<enclosure\b[^>]*url="([^"]+)"[^>]*type="image/.exec(item)?.[1] ??
        null;
      const when = decode(tag("pubDate") || tag("published") || tag("updated") || tag("dc:date"));
      const at = when ? new Date(when) : null;
      return {
        title: decode(tag("title")),
        link: link.trim(),
        image: image ? image.replace(/&amp;/g, "&") : null,
        at: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null,
        summary: decode(tag("description") || tag("summary") || tag("content")).slice(0, 180),
        source,
      };
    })
    .filter((item) => item.title !== "" && /^https:\/\//.test(item.link));
}

/** Newest first, at most two per source so one outlet cannot fill the card. */
export function pickNews(items: ReadonlyArray<TaskBoardHomeNewsItem>): TaskBoardHomeNewsItem[] {
  const perSource = new Map<string, number>();
  const picked: TaskBoardHomeNewsItem[] = [];
  for (const item of items.toSorted((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))) {
    const seen = perSource.get(item.source) ?? 0;
    if (seen >= PER_SOURCE_LIMIT) continue;
    perSource.set(item.source, seen + 1);
    picked.push(item);
    if (picked.length === NEWS_LIMIT) break;
  }
  return picked;
}

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const getJson = async (url: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as unknown;
};

interface GeoHit {
  readonly name: string;
  readonly admin1?: string;
  readonly country_code?: string;
  readonly latitude: number;
  readonly longitude: number;
}
interface Forecast {
  readonly current: {
    readonly time: string;
    readonly temperature_2m: number;
    readonly apparent_temperature: number;
    readonly weather_code: number;
    readonly is_day: number;
  };
  readonly daily: {
    readonly temperature_2m_max: ReadonlyArray<number>;
    readonly temperature_2m_min: ReadonlyArray<number>;
  };
}

/** Current weather for a named place via Open-Meteo (free, no key). Never throws. */
export function homeWeather(place: string): Promise<TaskBoardHomeWeather> {
  const key = place.trim().toLowerCase();
  const load = async (): Promise<TaskBoardHomeWeather> => {
    const geo = (await getJson(
      `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(place.trim())}`,
    )) as { results?: ReadonlyArray<GeoHit> };
    const hit = geo.results?.[0];
    if (!hit) return { status: "unavailable", reason: "place_not_found" };
    const unit = FAHRENHEIT.has(hit.country_code ?? "") ? "F" : "C";
    const forecast = (await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,apparent_temperature,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&temperature_unit=${unit === "F" ? "fahrenheit" : "celsius"}&timezone=auto&forecast_days=1`,
    )) as Forecast;
    const { condition, icon } = describeWeather(
      forecast.current.weather_code,
      forecast.current.is_day === 1,
    );
    return {
      status: "available",
      place: hit.admin1 ? `${hit.name}, ${hit.admin1}` : hit.name,
      unit,
      temp: Math.round(forecast.current.temperature_2m),
      feels: Math.round(forecast.current.apparent_temperature),
      high: Math.round(forecast.daily.temperature_2m_max[0] ?? forecast.current.temperature_2m),
      low: Math.round(forecast.daily.temperature_2m_min[0] ?? forecast.current.temperature_2m),
      condition,
      icon,
      observed: forecast.current.time,
    };
  };
  return cached(`weather:${key}`, WEATHER_TTL_MS, load).catch(
    () => ({ status: "unavailable", reason: "offline" }) as const,
  );
}

/** A few AI headlines from public feeds. Never throws; an empty list means every feed failed. */
export function homeNews(): Promise<{ items: TaskBoardHomeNewsItem[] }> {
  const load = async () => {
    const results = await Promise.all(
      FEEDS.map(async (feed) => {
        try {
          const response = await fetch(feed.url, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: { "User-Agent": "Leonidas/1.0 (+home news)" },
          });
          return response.ok ? parseFeed(await response.text(), feed.source) : [];
        } catch {
          return [];
        }
      }),
    );
    const items = pickNews(results.flat());
    if (items.length === 0) throw new Error("no feed answered");
    return { items };
  };
  return cached("news", NEWS_TTL_MS, load).catch(() => ({ items: [] }));
}

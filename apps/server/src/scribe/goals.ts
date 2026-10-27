import type { ScribeGoals, ScribeHistoryItem } from "@t3tools/contracts";

import { addDays, countWords, dayNumber, makeDayOf, oldestFirst } from "./statsDays.ts";

/**
 * Port of `goals.compute` (Python Scribe, goals.py), over engine history.
 * Dropped because the engine has no data for them: the Speed run quest and Speed Demon
 * (words per minute), the three time-saved achievements (typing speed), the voice speed
 * and multiplier, the lens signal for agent prompts (only the app list is used), and the
 * celebration events with `goals_state.json`.
 * Changed: the Python daily quest pick uses `random.Random(day).sample`. This port picks
 * with a small string hash instead, so quests differ from Python for the same day.
 */

const AGENT_APPS = new Set([
  "claude",
  "antigravity",
  "hermes",
  "cursor",
  "code",
  "windsurf",
  "codex",
  "zed",
  "warp",
  "windowsterminal",
  "kiro",
  "trae",
]);
const DEEP_WORDS = 100;
const DUMP_WORDS = 300;
const XP_DEEP_BONUS = 25;
const XP_QUEST = 150;
const XP_SWEEP = 200;
const XP_GOAL = 100;
const DAY_MS = 86_400_000;

/** (level reached, rank). Fast early ranks so a new user levels up on day one. */
const RANKS: ReadonlyArray<readonly [number, string]> = [
  [1, "Keyboard Hostage"],
  [3, "Mic Check"],
  [6, "Talker"],
  [10, "Prompt Whisperer"],
  [15, "Vibe Coder"],
  [22, "Agent Wrangler"],
  [30, "Flow State"],
  [40, "Voice Architect"],
  [52, "Orchestrator"],
  [66, "Commander"],
  [80, "Spartan"],
  [100, "Leonidas"],
];

/** Total XP needed to reach `level` (level 1 = 0). */
export const xpForLevel = (level: number): number =>
  Math.trunc(150 * Math.max(0, level - 1) ** 1.9);

export const levelForXp = (xp: number): number => {
  let level = Math.trunc((Math.max(0, xp) / 150) ** (1 / 1.9)) + 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  while (level > 1 && xpForLevel(level) > xp) level -= 1;
  return level;
};

export const rankFor = (level: number): string =>
  RANKS.filter(([from]) => from <= level).at(-1)?.[1] ?? "";

interface Row {
  readonly ms: number;
  readonly day: string;
  readonly words: number;
  readonly agent: boolean;
  readonly deep: boolean;
  readonly app: string;
  readonly transform: boolean;
}

const rowXp = (x: Row): number => x.words * (x.agent ? 1.5 : 1) + (x.deep ? XP_DEEP_BONUS : 0);

/** Fixed when set; else 110% of the last 7 active days' average (min 500), rounded up to 50. */
export const dailyGoal = (wordsByDay: ReadonlyMap<string, number>, day: string, fixed = 0) => {
  if (fixed) return Math.trunc(fixed);
  const past = [...wordsByDay]
    .filter(([d, w]) => d < day && w > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-7)
    .map(([, w]) => w);
  const avg = past.length ? past.reduce((a, b) => a + b, 0) / past.length : 0;
  return Math.max(500, Math.ceil((avg * 1.1) / 50) * 50);
};

/** Most dictations inside one 15 minute window (rewrites do not count). */
const burst = (rows: ReadonlyArray<Row>): number => {
  const times = rows.filter((x) => !x.transform).map((x) => x.ms);
  let best = 0;
  times.forEach((start, i) => {
    best = Math.max(best, times.slice(i).filter((u) => u - start <= 900_000).length);
  });
  return best;
};

type Progress = (rows: ReadonlyArray<Row>) => readonly [number, number];
interface QuestDef {
  readonly id: string;
  readonly title: string;
  readonly desc: string;
  readonly progress: Progress;
}
const countOf = (rows: ReadonlyArray<Row>, test: (x: Row) => boolean) => rows.filter(test).length;

const QUEST_POOL: ReadonlyArray<QuestDef> = [
  {
    id: "apps",
    title: "App hopper",
    desc: "Dictate messages into 2 different AI apps",
    progress: (rs) => [
      Math.min(2, new Set(rs.filter((x) => x.agent && x.app).map((x) => x.app)).size),
      2,
    ],
  },
  {
    id: "burst",
    title: "Flow burst",
    desc: "Make 5 dictations in 15 minutes",
    progress: (rs) => [Math.min(5, burst(rs)), 5],
  },
  {
    id: "count",
    title: "Hands off the keyboard",
    desc: "Make 15 dictations today",
    progress: (rs) => [
      Math.min(
        15,
        countOf(rs, (x) => !x.transform),
      ),
      15,
    ],
  },
  {
    id: "dump",
    title: "Brain dump",
    desc: "Talk one problem all the way through: a message of 300+ words to an AI",
    progress: (rs) => [
      Math.min(
        1,
        countOf(rs, (x) => x.agent && x.words >= DUMP_WORDS),
      ),
      1,
    ],
  },
  {
    id: "transform",
    title: "Rewrite pass",
    desc: "Rewrite some text with a rewrite preset",
    progress: (rs) => [
      Math.min(
        1,
        countOf(rs, (x) => x.transform),
      ),
      1,
    ],
  },
];
const DEEP_QUEST: QuestDef = {
  id: "deep",
  title: "Go deep",
  desc: "Send 3 long messages (100+ words) to an AI",
  progress: (rs) => [
    Math.min(
      3,
      countOf(rs, (x) => x.deep),
    ),
    3,
  ],
};

/** FNV-1a over the day text, so every user gets the same quests on the same day. */
export const dayHash = (day: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i += 1) h = Math.imul(h ^ day.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};

/** 3 quests a day: always Go deep, plus 2 picked by the date. */
export const questsFor = (day: string): ReadonlyArray<QuestDef> => {
  const h = dayHash(day);
  const first = QUEST_POOL[h % QUEST_POOL.length] as QuestDef;
  const rest = QUEST_POOL.filter((q) => q !== first);
  return [DEEP_QUEST, first, rest[Math.floor(h / QUEST_POOL.length) % rest.length] as QuestDef];
};

const questStatus = (day: string, rows: ReadonlyArray<Row>) =>
  questsFor(day).map((q) => {
    const [have, need] = q.progress(rows);
    return { id: q.id, title: q.title, desc: q.desc, have, need, done: have >= need, xp: XP_QUEST };
  });

type MetricKey =
  | "dictations"
  | "longestPrompt"
  | "words"
  | "bestStreak"
  | "bestDay"
  | "agentApps"
  | "deepPrompts"
  | "sweeps";

const ACHIEVEMENTS: ReadonlyArray<readonly [string, string, string, string, MetricKey, number]> = [
  ["first_words", "First Words", "Finish your first dictation", "mic", "dictations", 1],
  [
    "deep_diver",
    "Deep Diver",
    "Send a message of 100+ words to an AI",
    "flash",
    "longestPrompt",
    DEEP_WORDS,
  ],
  ["brain_dump", "Brain Dump", "Send a message of 300+ words", "bulb", "longestPrompt", DUMP_WORDS],
  ["monologue", "The Monologue", "Send a message of 750+ words", "volume", "longestPrompt", 750],
  ["century", "Century", "100 dictations", "check", "dictations", 100],
  ["thousand", "Thousand Takes", "1,000 dictations", "history", "dictations", 1000],
  ["w10k", "10K Club", "Speak 10,000 words", "chart", "words", 10_000],
  ["w100k", "100K Club", "Speak 100,000 words", "chart", "words", 100_000],
  ["w1m", "Million Word Mouth", "Speak 1,000,000 words", "star", "words", 1_000_000],
  ["streak3", "Warming Up", "3-day streak", "sync", "bestStreak", 3],
  ["streak7", "Week Warrior", "7-day streak", "sync", "bestStreak", 7],
  ["streak30", "Unbreakable", "30-day streak", "sync", "bestStreak", 30],
  ["bigday", "Big Day", "3,000 words in one day", "calendar", "bestDay", 3000],
  ["marathon", "Marathon", "10,000 words in one day", "calendar", "bestDay", 10_000],
  ["polyglot", "App Polyglot", "Send messages to 3 different AI apps", "people", "agentApps", 3],
  ["deep100", "Deep Thinker", "100 long messages", "bulb", "deepPrompts", 100],
  ["sweep", "Clean Sweep", "Finish all 3 daily quests in one day", "star", "sweeps", 1],
  ["deep1000", "Deep Legend", "1,000 long messages", "bulb", "deepPrompts", 1000],
  ["leviathan", "Leviathan Day", "25,000 words in one day", "calendar", "bestDay", 25_000],
  ["streak100", "Centurion", "100-day streak", "sync", "bestStreak", 100],
];

/** Python `round()`: halves go to the even number. */
const roundHalfEven = (x: number): number => {
  const floor = Math.floor(x);
  if (x - floor !== 0.5) return Math.round(x);
  return floor % 2 === 0 ? floor : floor + 1;
};

const mean = (values: ReadonlyArray<number>) =>
  values.length ? roundHalfEven(values.reduce((a, b) => a + b, 0) / values.length) : 0;

export interface GoalsOptions {
  /** A fixed daily word goal; 0 or unset means the adaptive goal. */
  readonly dailyWords?: number | undefined;
}

/** `items` come newest first, as the engine lists them. */
export function computeGoals(
  items: ReadonlyArray<ScribeHistoryItem>,
  now: number,
  timeZone?: string,
  options: GoalsOptions = {},
): Omit<ScribeGoals, "truncated"> {
  const dayOf = makeDayOf(timeZone);
  const rows: Row[] = oldestFirst(items).map(({ item, ms }) => {
    const transform = item.mode === "rewrite";
    const app = item.app.toLowerCase();
    const words = countWords(item.cleanedText);
    const agent = !transform && AGENT_APPS.has(app.replace(/\.exe$/, ""));
    return {
      ms,
      day: dayOf(ms),
      words: transform ? 0 : words,
      agent,
      deep: agent && words >= DEEP_WORDS,
      app,
      transform,
    };
  });
  const today = dayOf(now);
  const byDay = new Map<string, Row[]>();
  for (const x of rows) byDay.set(x.day, [...(byDay.get(x.day) ?? []), x]);
  const wordsByDay = new Map<string, number>(
    [...byDay].map(([d, rs]) => [d, rs.reduce((a, x) => a + x.words, 0)]),
  );
  const fixed = options.dailyWords ?? 0;

  let xp = 0;
  let sweeps = 0;
  let questsDone = 0;
  for (const [day, rs] of [...byDay].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    xp += rs.reduce((a, x) => a + rowXp(x), 0);
    const quests = questStatus(day, rs);
    const done = quests.filter((q) => q.done).length;
    questsDone += done;
    xp += XP_QUEST * done;
    if (done === quests.length) {
      sweeps += 1;
      xp += XP_SWEEP;
    }
    if ((wordsByDay.get(day) ?? 0) >= dailyGoal(wordsByDay, day, fixed)) xp += XP_GOAL;
  }

  // Streaks count days with any dictation (rewrites do not).
  const days = [...byDay]
    .filter(([, rs]) => rs.some((x) => !x.transform))
    .map(([d]) => d)
    .sort();
  let bestStreak = 0;
  let run = 0;
  let prevNumber: number | null = null;
  for (const d of days) {
    const n = dayNumber(d);
    run = prevNumber !== null && n - prevNumber === 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prevNumber = n;
  }
  const dayset = new Set(days);
  let cursor = dayset.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (dayset.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  const agentRows = rows.filter((x) => x.agent);
  const weekAgo = now - 7 * DAY_MS;
  const fortnightAgo = now - 14 * DAY_MS;
  const metrics = {
    dictations: countOf(rows, (x) => !x.transform),
    words: rows.reduce((a, x) => a + x.words, 0),
    longestPrompt: Math.max(0, ...agentRows.map((x) => x.words)),
    bestStreak,
    bestDay: Math.max(0, ...wordsByDay.values()),
    agentApps: new Set(agentRows.filter((x) => x.app).map((x) => x.app)).size,
    deepPrompts: countOf(rows, (x) => x.deep),
    sweeps,
  };
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  const next = RANKS.find(([from]) => from > level);
  const todayRows = byDay.get(today) ?? [];
  return {
    xp: Math.trunc(xp),
    level,
    rank: rankFor(level),
    levelFloor: floor,
    levelCeil: ceil,
    levelFrac: (xp - floor) / Math.max(1, ceil - floor),
    nextRank: next ? { level: next[0], name: next[1] } : null,
    today: {
      day: today,
      words: wordsByDay.get(today) ?? 0,
      goal: dailyGoal(wordsByDay, today, fixed),
      deep: countOf(todayRows, (x) => x.deep),
      deepGoal: 3,
      xp: Math.trunc(todayRows.reduce((a, x) => a + rowXp(x), 0)),
      dictations: countOf(todayRows, (x) => !x.transform),
    },
    quests: questStatus(today, todayRows),
    questsDone,
    streak,
    bestStreak,
    depth7d: mean(agentRows.filter((x) => x.ms >= weekAgo).map((x) => x.words)),
    depthPrev: mean(
      agentRows.filter((x) => x.ms >= fortnightAgo && x.ms < weekAgo).map((x) => x.words),
    ),
    metrics,
    achievements: ACHIEVEMENTS.map(([id, name, how, glyph, key, need]) => ({
      id,
      name,
      how,
      glyph,
      key,
      have: metrics[key],
      need,
      unlocked: metrics[key] >= need,
    })),
  };
}

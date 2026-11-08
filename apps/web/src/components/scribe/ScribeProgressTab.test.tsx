// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EnvironmentId, type ScribeGoals, type ScribeInsights } from "@t3tools/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  goals: { data: null as unknown, error: null as unknown, refresh: vi.fn() },
  insights: { data: null as unknown, error: null as unknown, refresh: vi.fn() },
}));
vi.mock("~/state/query", () => ({
  useEnvironmentQuery: (query: string) => (query === "goals" ? mocks.goals : mocks.insights),
}));
vi.mock("~/state/scribe", () => ({
  scribeGoalsQuery: () => "goals",
  scribeInsightsQuery: () => "insights",
}));
import { ScribeProgressTab } from "./ScribeProgressTab";
import { INITIAL_SCRIBE_LIVE } from "./scribeLive.logic";

const props = { environmentId: EnvironmentId.make("env-1"), live: INITIAL_SCRIBE_LIVE };

const goals = (over: Partial<ScribeGoals> = {}): ScribeGoals => ({
  xp: 98_420,
  level: 31,
  rank: "Flow State",
  levelFloor: 96_075,
  levelCeil: 102_255,
  levelFrac: 0.379,
  nextRank: { level: 40, name: "Voice Architect" },
  today: {
    day: "2026-10-29",
    words: 2140,
    goal: 2500,
    deep: 4,
    deepGoal: 6,
    xp: 380,
    dictations: 31,
  },
  quests: [
    {
      id: "burst",
      title: "Flow burst",
      desc: "Dictate 5 times in 10 minutes",
      have: 5,
      need: 5,
      done: true,
      xp: 150,
    },
    {
      id: "apps",
      title: "App hopper",
      desc: "Dictate into 3 different apps",
      have: 2,
      need: 3,
      done: false,
      xp: 150,
    },
  ],
  questsDone: 1,
  streak: 12,
  bestStreak: 19,
  depth7d: 0,
  depthPrev: 0,
  metrics: {
    dictations: 9214,
    words: 412_880,
    longestPrompt: 412,
    bestStreak: 19,
    bestDay: 7260,
    agentApps: 6,
    deepPrompts: 377,
    sweeps: 1,
  },
  achievements: [
    {
      id: "first",
      name: "First Words",
      how: "Finish your first dictation",
      glyph: "mic",
      key: "dictations",
      have: 9214,
      need: 1,
      unlocked: true,
    },
    {
      id: "mono",
      name: "The Monologue",
      how: "Send a message of 750+ words",
      glyph: "volume",
      key: "longestPrompt",
      have: 412,
      need: 750,
      unlocked: false,
    },
  ],
  truncated: false,
  ...over,
});

const insights = (over: Partial<ScribeInsights> = {}): ScribeInsights => ({
  words: 412_880,
  transcripts: 9214,
  daysActive: 96,
  firstDay: "2026-07-20",
  lastDay: "2026-10-29",
  todayWords: 2140,
  todayTranscripts: 31,
  streakDays: 12,
  weekAvgWords: 3015,
  weekly: {
    words: 21_105,
    prevWords: 17_880,
    transcripts: 214,
    prevTranscripts: 196,
    p50: 1400,
    prevP50: 1600,
    topApp: "Claude",
    days: [
      { day: "2026-10-23", words: 3410 },
      { day: "2026-10-24", words: 4120 },
      { day: "2026-10-25", words: 0 },
    ],
  },
  latencySamples: 9214,
  p50: 1400,
  p90: 3100,
  sttP50: 620,
  polishP50: 710,
  sttShare: 46,
  polishShare: 54,
  byDay: {},
  byMode: [],
  byApp: [
    { key: "Claude", count: 3102 },
    { key: "WindowsTerminal-Preview (Administrator)", count: 88 },
  ],
  truncated: false,
  ...over,
});

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.goals = { data: null, error: null, refresh: vi.fn() };
  mocks.insights = { data: null, error: null, refresh: vi.fn() };
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const draw = async (node: React.ReactElement) => act(async () => root.render(node));
const ready = (g = goals(), i = insights()) => {
  mocks.goals.data = g;
  mocks.insights.data = i;
};

it("shows today, quests, the week, speed, apps and the next unlocks", async () => {
  ready();
  await draw(<ScribeProgressTab {...props} />);
  const text = container.textContent ?? "";
  expect(text).toContain("2,140of 2,500 words");
  expect(text).toContain("360 words to go.");
  expect(text).toContain("12 days");
  expect(text).toContain("best 19");
  expect(text).toContain("Flow State");
  expect(text).toContain("3,835 XP to level 32");
  expect(text).toContain("1 of 2 done");
  expect(text).toContain(
    "This week you spoke 21,105 words, 18% more than last week, mostly in Claude.",
  );
  expect(text).toContain("Hearing 0.6 s");
  expect(text).toContain("1.4 s typical");
  expect(text).toContain("WindowsTerminal-Preview (Administrator)");
  expect(text).toContain("Next to unlock");
  expect(text).toContain("412 of 750");
  expect(text).toContain("1 of 2 unlocked");
  // Only the goal bar is read aloud. Every other bar repeats text beside it.
  expect(container.querySelectorAll("[role=progressbar]")).toHaveLength(1);
});

it("counts quests done today, not the engine's all-time total", async () => {
  ready(goals({ questsDone: 94 }));
  await draw(<ScribeProgressTab {...props} />);
  expect(container.textContent).toContain("1 of 2 done");
  expect(container.textContent).not.toContain("94 of");
});

it("labels the last bar Today and reads the day before its value", async () => {
  ready();
  await draw(<ScribeProgressTab {...props} />);
  const days = container.querySelectorAll("ul[aria-label='Words per day this week'] li");
  expect(days.length).toBe(3);
  expect(days[0]?.textContent).toBe("Fri3,410");
  expect(days[2]?.textContent).toBe("Today0");
});

it("hides the speed split when no row saved a split", async () => {
  ready(goals(), insights({ sttP50: 0, polishP50: 0 }));
  await draw(<ScribeProgressTab {...props} />);
  expect(container.textContent).not.toContain("Hearing 0.0 s");
  expect(container.textContent).toContain("Hearing turns your speech into text.");
});

it("capitalizes merged app names", async () => {
  ready(goals(), insights({ byApp: [{ key: "leonidas code", count: 2406 }] }));
  await draw(<ScribeProgressTab {...props} />);
  expect(container.textContent).toContain("Leonidas Code");
});

it("lists every achievement after Show all is pressed", async () => {
  ready();
  await draw(<ScribeProgressTab {...props} />);
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.startsWith("Show all"),
  );
  expect(button?.getAttribute("aria-expanded")).toBe("false");
  await act(async () => button?.click());
  expect(container.textContent).toContain("First Words");
  expect(button?.getAttribute("aria-expanded")).toBe("true");
});

it("refetches both numbers once when a new dictation is saved", async () => {
  ready();
  // Its own environment, so the remembered newest id does not leak into other tests.
  const own = { ...props, environmentId: EnvironmentId.make("env-refresh") };
  const item = { id: "h1" } as (typeof INITIAL_SCRIBE_LIVE.saved)[number];
  await draw(<ScribeProgressTab {...own} />);
  expect(mocks.goals.refresh).not.toHaveBeenCalled();
  await draw(<ScribeProgressTab {...own} live={{ ...INITIAL_SCRIBE_LIVE, saved: [item] }} />);
  await draw(<ScribeProgressTab {...own} live={{ ...INITIAL_SCRIBE_LIVE, saved: [item] }} />);
  expect(mocks.goals.refresh).toHaveBeenCalledTimes(1);
  expect(mocks.insights.refresh).toHaveBeenCalledTimes(1);
});

it("asks a new user to dictate before the first dictation", async () => {
  ready(goals(), insights({ words: 0, transcripts: 0 }));
  await draw(<ScribeProgressTab {...props} />);
  expect(container.textContent).toContain("Nothing to show yet");
  expect(container.textContent).not.toContain("Daily quests");
});

it("offers a retry that reloads both when the numbers fail to load", async () => {
  mocks.insights.error = new Error("offline");
  mocks.goals.data = goals();
  await draw(<ScribeProgressTab {...props} />);
  expect(container.querySelector("[role=alert]")).not.toBeNull();
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Try again",
  );
  await act(async () => button?.click());
  expect(mocks.goals.refresh).toHaveBeenCalledTimes(1);
  expect(mocks.insights.refresh).toHaveBeenCalledTimes(1);
});

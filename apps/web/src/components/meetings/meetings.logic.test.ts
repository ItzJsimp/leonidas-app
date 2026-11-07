import { describe, expect, it } from "vite-plus/test";

import {
  agentMention,
  filterMeetings,
  formatClock,
  formatLength,
  isBusy,
  meetingMarkdown,
  mergeSegments,
  parseMeetingDetail,
  parseMeetingList,
  parseLive,
  parseDetect,
  parseDiscord,
  liveTail,
} from "./meetings.logic";

const detail = parseMeetingDetail({
  id: "m1",
  title: "Plan",
  started: "2026-11-07T09:00:00Z",
  durationMs: 1_500_000,
  state: "done",
  people: ["Me", "Sam"],
  folder: "C:/meetings/m1",
  note: {
    summary: ["Ship Friday."],
    decisions: [{ t: 3, text: "Use Groq" }],
    action_items: [{ owner: "Sam", task: "Send the deck", t: 9 }],
  },
  transcript: [
    { speaker_key: "Me", t0: 0, text: "Hello" },
    { speaker_key: "Me", t0: 4, text: "again" },
    { speaker_key: "Sam", t0: 65, text: "Hi" },
    { speaker_key: "Sam", t0: 70, text: "  " },
  ],
})!;

describe("meetings.logic", () => {
  it("skips rows with no id and defaults a missing title and state", () => {
    const items = parseMeetingList({ items: [{ title: "no id" }, { id: "a" }, 5] });
    expect(items.map((item) => [item.id, item.title, item.state])).toEqual([
      ["a", "Untitled meeting", "done"],
    ]);
  });

  it("merges one speaker's lines and drops empty ones", () => {
    expect(mergeSegments(detail.segments).map((s) => [s.speaker, s.text])).toEqual([
      ["Me", "Hello again"],
      ["Sam", "Hi"],
    ]);
  });

  it("writes notes above the transcript", () => {
    const md = meetingMarkdown(detail);
    expect(md).toContain("## Decisions\n\n- Use Groq");
    expect(md).toContain("- Sam: Send the deck");
    expect(md.indexOf("## Summary")).toBeLessThan(md.indexOf("## Transcript"));
    expect(md).toContain("**Sam** (01:05): Hi");
  });

  it("formats length and clock", () => {
    expect(formatLength(20_000)).toBe("Under 1 min");
    expect(formatLength(25 * 60_000)).toBe("25 min");
    expect(formatLength(150 * 60_000)).toBe("2 h 30 min");
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("filters by title, app and people, and flags busy meetings", () => {
    const items = parseMeetingList({
      items: [
        { id: "a", title: "Roblox", people: ["Sam"] },
        { id: "b", title: "Sales", app: "Zoom", state: "transcribing" },
      ],
    });
    expect(filterMeetings(items, "sam").map((i) => i.id)).toEqual(["a"]);
    expect(filterMeetings(items, "ZOOM").map((i) => i.id)).toEqual(["b"]);
    expect(items.map(isBusy)).toEqual([false, true]);
  });

  it("builds the agent line from the folder", () => {
    expect(agentMention(detail)).toContain("in C:/meetings/m1");
  });

  it("reads the live view and clamps levels", () => {
    const live = parseLive({
      recording: true,
      phase: "recording",
      elapsedMs: 5000,
      levels: { me: 2, them: -1 },
      segments: [
        { track: "them", t0: 1, text: "Hi" },
        { speaker_key: "Me", t0: 2, text: "" },
        { speaker_key: "Me", t0: 3, text: "Yes" },
      ],
      notices: ["Call audio is not recorded: no device", 7],
    });
    expect(live.levels).toEqual({ me: 1, them: 0 });
    expect(liveTail(live, 1).map((s) => [s.speaker, s.text])).toEqual([["Me", "Yes"]]);
    expect(live.notices).toHaveLength(1);
    expect(parseLive(null).recording).toBe(false);
  });

  it("reads the detect and Discord replies without trusting their shape", () => {
    expect(parseDetect({ app: "Discord" })).toBe("Discord");
    expect(parseDetect({ app: null })).toBeNull();
    expect(parseDiscord({ configured: true, connected: true, user: { username: "jake" } })).toEqual(
      {
        configured: true,
        connected: true,
        user: "jake",
      },
    );
    expect(parseDiscord("x").connected).toBe(false);
  });
});

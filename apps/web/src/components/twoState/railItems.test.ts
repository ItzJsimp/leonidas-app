import { describe, expect, it } from "vite-plus/test";

import { activeRailId, badgeAnnouncement, railItems, railLinkLabel } from "./railItems";

const ids = (items: ReadonlyArray<{ readonly id: string }>) => items.map((item) => item.id);

const BASE = [
  "command-center",
  "chat",
  "scribe",
  "meetings",
  "inbox",
  "today",
  "tasks",
  "projects",
  "memory",
  "library",
  "images",
  "files",
  "automations",
  "subagents",
];
const MARKETING_AND_CONTENT = ["content", "deals"];
// A business workspace puts Marketing and Content between Library and Images, as before.
const withBusiness = (base: string[]) => {
  const at = base.indexOf("images");
  return [...base.slice(0, at), ...MARKETING_AND_CONTENT, ...base.slice(at)];
};

describe("railItems", () => {
  it("hides Marketing, Content, Team and Developer in a personal workspace without builder mode", () => {
    const { main } = railItems({ business: false, builder: false, scribe: true });
    expect(ids(main)).toEqual(BASE);
  });

  it("shows Marketing, Content and Team in a business workspace", () => {
    const { main } = railItems({ business: true, builder: false, scribe: true });
    expect(ids(main)).toEqual([...withBusiness(BASE), "team"]);
  });

  it("shows Developer only with builder mode on", () => {
    const on = railItems({ business: false, builder: true, scribe: true }).main;
    const off = railItems({ business: false, builder: false, scribe: true }).main;
    expect(ids(on)).toEqual([...BASE, "developer"]);
    expect(ids(off)).not.toContain("developer");
  });

  it("shows everything, Team before Developer, for business with builder mode", () => {
    const { main } = railItems({ business: true, builder: true, scribe: true });
    expect(ids(main)).toEqual([...withBusiness(BASE), "team", "developer"]);
    expect(main).toHaveLength(18);
  });

  it("brings back only the tabs chosen with show-anyway in a personal workspace", () => {
    const one = railItems({ business: false, builder: false, showAnyway: ["deals"], scribe: true });
    expect(ids(one.main)).toEqual([...BASE.slice(0, 10), "deals", ...BASE.slice(10)]);
    const all = railItems({
      business: false,
      builder: false,
      showAnyway: ["content", "deals", "team"],
      scribe: true,
    });
    expect(ids(all.main)).toEqual([...withBusiness(BASE), "team"]);
  });

  it("does not let show-anyway turn on Developer", () => {
    const { main } = railItems({
      business: false,
      builder: false,
      showAnyway: ["developer"],
      scribe: true,
    });
    expect(ids(main)).not.toContain("developer");
  });

  it("hides the Scribe and Meetings icons when the server is not Windows", () => {
    const { main } = railItems({ business: true, builder: true, scribe: false });
    expect(ids(main)).toEqual(
      withBusiness(BASE.filter((id) => id !== "scribe" && id !== "meetings")).concat(
        "team",
        "developer",
      ),
    );
  });

  it("always has Usage then Settings at the bottom", () => {
    for (const business of [false, true]) {
      for (const builder of [false, true]) {
        expect(ids(railItems({ business, builder, scribe: true }).bottom)).toEqual([
          "usage",
          "settings",
        ]);
      }
    }
  });

  it("points each icon at its page and gives a plain tooltip", () => {
    const { main, bottom } = railItems({ business: true, builder: true, scribe: true });
    expect(main.find((item) => item.id === "inbox")).toMatchObject({
      to: "/inbox",
      tooltip: "Notifications: what needs you and what finished",
    });
    expect(main.find((item) => item.id === "chat")).toMatchObject({
      label: "Leonidas Chat",
      tooltip: "Leonidas Chat: talk with Leonidas and run agents",
    });
    expect(main.find((item) => item.id === "content")).toMatchObject({
      to: "/marketing",
      label: "Marketing",
      tooltip: "Marketing: posts and campaigns",
    });
    expect(main.find((item) => item.id === "deals")).toMatchObject({
      to: "/content",
      label: "Content",
      tooltip: "Content: deals, scripts and what to film",
    });
    expect(bottom.map((item) => item.to)).toEqual(["/usage", "/settings"]);
    expect(main.find((item) => item.id === "developer")?.alsoActiveOn).toEqual([
      "/git",
      "/pull-requests",
    ]);
    // Jake named the chat item "Leonidas Chat" (2026-11-05). Other items stay plain.
    for (const item of [...main, ...bottom]) {
      const text = `${item.label}${item.tooltip}`;
      expect(text).not.toMatch(/—|\bcode\b|MCP|worktree|T3/i);
    }
  });
});

describe("activeRailId", () => {
  it("marks the icon for the open page", () => {
    expect(activeRailId("/inbox", false)).toBe("inbox");
    expect(activeRailId("/settings/general", false)).toBe("settings");
    expect(activeRailId("/marketing", false)).toBe("content");
    expect(activeRailId("/content", false)).toBe("deals");
  });
  it("marks Chat for the index page and for any chat", () => {
    expect(activeRailId("/", false)).toBe("chat");
    expect(activeRailId("/env/thread", true)).toBe("chat");
  });
  it("marks nothing for a page the rail does not list", () => {
    expect(activeRailId("/pair", false)).toBeNull();
  });
  it("marks Memory on the brain map page", () => {
    expect(activeRailId("/brain", false)).toBe("memory");
    expect(activeRailId("/brain/x", false)).toBe("memory");
  });
  it("marks Developer on the Git and pull request pages", () => {
    expect(activeRailId("/git", false)).toBe("developer");
    expect(activeRailId("/pull-requests", false)).toBe("developer");
    expect(activeRailId("/developer", false)).toBe("developer");
  });
  it("marks Settings on This PC and on every settings page", () => {
    expect(activeRailId("/system-care", false)).toBe("automations");
    expect(activeRailId("/automations", false)).toBe("automations");
    expect(activeRailId("/settings/appearance", false)).toBe("settings");
    expect(activeRailId("/settings/open-source-licenses", false)).toBe("settings");
  });
  it("matches whole path parts only, never a longer name", () => {
    expect(activeRailId("/gitlab", false)).toBeNull();
    expect(activeRailId("/brainstorm", false)).toBeNull();
    expect(activeRailId("/system-carefree", false)).toBeNull();
  });
});

describe("badgeAnnouncement", () => {
  it("says nothing on the first load or when the count did not change", () => {
    expect(badgeAnnouncement(null, 3)).toBe("");
    expect(badgeAnnouncement(null, null)).toBe("");
    expect(badgeAnnouncement(3, 3)).toBe("");
    expect(badgeAnnouncement(3, null)).toBe("");
  });
  it("says the new count after a change", () => {
    expect(badgeAnnouncement(3, 4)).toBe("4 need you");
    expect(badgeAnnouncement(0, 1)).toBe("1 needs you");
    expect(badgeAnnouncement(2, 0)).toBe("Nothing needs you");
  });
});

describe("railLinkLabel", () => {
  it("names the page and, with a badge, how many need you in correct grammar", () => {
    expect(railLinkLabel("Inbox", 0)).toBe("Inbox");
    expect(railLinkLabel("Inbox", 1)).toBe("Inbox, 1 needs you");
    expect(railLinkLabel("Inbox", 3)).toBe("Inbox, 3 need you");
  });
});

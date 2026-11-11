import { describe, expect, it } from "vite-plus/test";

import {
  AVATAR_IDS,
  avatarId,
  avatarUrl,
  avatarValue,
  defaultAvatar,
  initials,
} from "./avatar.logic";

describe("avatar logic", () => {
  it("lists 32 unique library ids", () => {
    expect(AVATAR_IDS).toHaveLength(32);
    expect(new Set(AVATAR_IDS).size).toBe(32);
    expect(AVATAR_IDS.every((id) => /^[a-z]+(-[a-z]+)*$/u.test(id))).toBe(true);
  });

  it("reads `felt/<id>` and refuses anything else", () => {
    expect(avatarId("felt/researcher")).toBe("researcher");
    expect(avatarId("felt/team-lead")).toBe("team-lead");
    expect(avatarId("felt/not-in-the-library")).toBeNull();
    expect(avatarId("hexagon:teal")).toBeNull();
    expect(avatarId(null)).toBeNull();
    expect(avatarId(undefined)).toBeNull();
  });

  it("builds the stored value and the public image path", () => {
    expect(avatarValue("scout")).toBe("felt/scout");
    expect(avatarUrl("scout")).toBe("/agents/avatars/scout.webp");
    expect(avatarId(avatarValue("wizard"))).toBe("wizard");
  });

  it("starts a new agent on the avatar named like it, else the helper", () => {
    expect(defaultAvatar("reviewer")).toBe("felt/reviewer");
    expect(defaultAvatar("my-odd-agent")).toBe("felt/helper");
  });

  it("makes initials for the fallback badge", () => {
    expect(initials("team-lead")).toBe("TL");
    expect(initials("scout")).toBe("SC");
    expect(initials("data ingestor tool")).toBe("DI");
    expect(initials("")).toBe("?");
  });
});

/**
 * The felt avatar library (skill `felt-avatars`). An agent file holds `avatar: felt/<id>`, and
 * the image is `/agents/avatars/<id>.webp` in the web public folder.
 */
export const AVATAR_IDS = [
  "accountant",
  "analyst",
  "architect",
  "automation",
  "coder",
  "compliance",
  "datakeeper",
  "debugger",
  "devops",
  "frontend-designer",
  "gardener",
  "helper",
  "investigator",
  "leonidas",
  "librarian",
  "marketer",
  "musician",
  "navigator",
  "photographer",
  "planner",
  "researcher",
  "reviewer",
  "scientist",
  "scout",
  "security",
  "support",
  "teacher",
  "team-lead",
  "tester",
  "translator",
  "wizard",
  "writer",
] as const;

const KNOWN: ReadonlySet<string> = new Set(AVATAR_IDS);

/** `felt/researcher` gives `researcher`. Any other value, or an id the library lacks, gives null. */
export function avatarId(avatar: string | null | undefined): string | null {
  if (typeof avatar !== "string" || !avatar.startsWith("felt/")) return null;
  const id = avatar.slice("felt/".length);
  return KNOWN.has(id) ? id : null;
}

export const avatarValue = (id: string) => `felt/${id}`;
export const avatarUrl = (id: string) => `/agents/avatars/${id}.webp`;

/** The avatar a new agent starts with: the library id that equals its name, else `helper`. */
export function defaultAvatar(name: string): string {
  return avatarValue(KNOWN.has(name) ? name : "helper");
}

/** Up to two letters for the fallback badge: "team-lead" gives "TL", "scout" gives "SC". */
export function initials(name: string): string {
  const words = name.split(/[\s_-]+/u).filter((word) => word.length > 0);
  const letters =
    words.length > 1
      ? words
          .slice(0, 2)
          .map((word) => word.charAt(0))
          .join("")
      : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

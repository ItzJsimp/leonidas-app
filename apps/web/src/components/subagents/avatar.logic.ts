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

/** The library id that a name holds: the name itself ("reviewer") or a dash word of it ("test-scout"). */
function idInName(name: string): string | null {
  if (KNOWN.has(name)) return name;
  return name.split("-").find((word) => KNOWN.has(word)) ?? null;
}

/** The avatar a new agent starts with: the library id its name holds, else `helper`. */
export function defaultAvatar(name: string): string {
  return avatarValue(avatarIdFor(null, name));
}

/** The library id to draw: the file's own avatar, else the one the name holds, else `helper`. Never empty. */
export function avatarIdFor(avatar: string | null | undefined, name: string): string {
  return avatarId(avatar) ?? idInName(name) ?? "helper";
}

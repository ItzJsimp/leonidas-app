/** Checks for the calendar links a user pastes. A private calendar link is a secret: it is never logged or sent back. */

const MAX_LINK_LENGTH = 2048;
/** A year of busy calendar is well under this. It stops a link that points at a huge file. */
export const MAX_CALENDAR_BYTES = 5 * 1024 * 1024;

export type LinkCheck =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly message: string };

/** Accepts http, https and webcal links. `webcal://` is `https://` with another name. */
export function checkCalendarLink(raw: string): LinkCheck {
  const text = raw.trim();
  if (text.length === 0) return { ok: false, message: "Paste the calendar link first." };
  if (text.length > MAX_LINK_LENGTH) return { ok: false, message: "That link is too long." };
  const asHttp = text.replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(asHttp);
  } catch {
    return {
      ok: false,
      message: "That does not look like a link. It should start with https:// or webcal://.",
    };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, message: "Only https:// and webcal:// links work." };
  }
  if (url.hostname.length === 0) return { ok: false, message: "That link has no website name." };
  return { ok: true, url: url.toString() };
}

/** Shows enough to tell two calendars apart: the site and four letters of the longest path part. */
export function maskCalendarLink(url: string): string {
  try {
    const parsed = new URL(url);
    const longest = parsed.pathname.split("/").reduce((a, b) => (b.length > a.length ? b : a), "");
    return `${parsed.hostname}/...${longest.slice(-4)}`;
  } catch {
    return "calendar link";
  }
}

const CALENDAR_COLORS = [
  "#4f8cff",
  "#34a853",
  "#e8710a",
  "#d93025",
  "#9334e6",
  "#00897b",
  "#c2185b",
  "#5f6368",
] as const;

export const pickColor = (raw: string, fallbackIndex: number): string =>
  /^#[0-9a-fA-F]{6}$/.test(raw)
    ? raw.toLowerCase()
    : (CALENDAR_COLORS[fallbackIndex % CALENDAR_COLORS.length] ?? CALENDAR_COLORS[0]);

export const defaultCalendarName = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Calendar";
  }
};

import type { SavedItem } from "@t3tools/contracts";

export const SAVED_GROUP = "Saved";
const OTHER_GROUP = "Other";

/** Files the app writes for "Save this message" are named `saved-prompt-<slug>.md`. */
const SAVED_FILE = /saved-prompt-[^:]*\.md$/;

export function promptGroup(item: SavedItem): string {
  if (SAVED_FILE.test(item.id)) return SAVED_GROUP;
  const category = item.tags[0];
  return category ? category.charAt(0).toUpperCase() + category.slice(1) : OTHER_GROUP;
}

const groupRank = (name: string) => (name === SAVED_GROUP ? 0 : name === OTHER_GROUP ? 2 : 1);

export function promptGroups(items: ReadonlyArray<SavedItem>) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(promptGroup(item), (counts.get(promptGroup(item)) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .toSorted((a, b) => groupRank(a.name) - groupRank(b.name) || a.name.localeCompare(b.name));
}

/** `group` null is All. Saved prompts come first; the rest keep the server order. */
export function filterPrompts(
  items: ReadonlyArray<SavedItem>,
  group: string | null,
  query: string,
) {
  const needle = query.trim().toLowerCase();
  return items
    .filter(
      (item) =>
        (group === null || promptGroup(item) === group) &&
        `${item.title}\n${item.body}`.toLowerCase().includes(needle),
    )
    .toSorted(
      (a, b) => Number(promptGroup(b) === SAVED_GROUP) - Number(promptGroup(a) === SAVED_GROUP),
    );
}

export function savedPromptTitle(text: string): string {
  const firstLine = text.trim().split(/\r?\n/)[0] ?? "";
  return firstLine.split(/\s+/).slice(0, 4).join(" ");
}

/** A prompt never erases what the user already typed. */
export function insertPromptText(draft: string, body: string): string {
  return draft.trim() ? `${draft.trimEnd()}\n\n${body}` : body;
}

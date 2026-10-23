export interface AreaOption {
  readonly slug: string;
  readonly name: string;
}

/** The Areas a task can be private in. Home is out: every Member reads Home. Archived Areas are out. */
export function privateAreaOptions(
  areas: ReadonlyArray<AreaOption & { readonly status: string }>,
): Array<AreaOption> {
  return areas
    .filter((area) => area.slug !== "home" && area.status === "active")
    .map(({ slug, name }) => ({ slug, name }));
}

/** The Area a private task sits in (the `area:<slug>` label), or null for a public task. */
export function taskPrivateArea(task: { readonly labels: ReadonlyArray<string> }): string | null {
  if (!task.labels.includes("private")) return null;
  return task.labels.find((label) => label.startsWith("area:"))?.slice("area:".length) ?? null;
}

const GROUPS = {
  radiogroup: { item: '[role="radio"]', vertical: true, picks: true },
  tablist: { item: '[role="tab"]', vertical: false, picks: true },
  toolbar: { item: "button", vertical: false, picks: false },
} as const;

/**
 * Keyboard support for a hand-set radio group, tab list or toolbar: pass as the group's `ref`.
 * The group is one Tab stop. Arrows, Home and End move inside it. A radio or tab is picked
 * as focus reaches it.
 */
export function rovingGroup(group: HTMLElement | null) {
  if (!group) return;
  const kind = GROUPS[group.getAttribute("role") as keyof typeof GROUPS];
  const items = () =>
    [...group.querySelectorAll<HTMLElement>(kind.item)].filter(
      (item) => !item.matches(":disabled"),
    );
  const setStop = (stop: HTMLElement | undefined) => {
    for (const item of items()) item.tabIndex = item === stop ? 0 : -1;
  };
  const sync = () => {
    const all = items();
    const picked = all.find((item) =>
      item.matches('[aria-checked="true"], [aria-selected="true"]'),
    );
    setStop(picked ?? all.find((item) => item.tabIndex === 0) ?? all[0]);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const all = items();
    const index = all.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    const forward = getComputedStyle(group).direction === "rtl" ? -1 : 1;
    const step: Record<string, number> = {
      ArrowRight: index + forward,
      ArrowLeft: index - forward,
      Home: 0,
      End: all.length - 1,
      ...(kind.vertical ? { ArrowDown: index + 1, ArrowUp: index - 1 } : {}),
    };
    const next = step[event.key];
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const item = all[(next + all.length) % all.length]!;
    setStop(item);
    item.focus();
    if (kind.picks) item.click();
  };
  const observer = new MutationObserver(sync);
  observer.observe(group, {
    subtree: true,
    childList: true,
    attributeFilter: ["aria-checked", "aria-selected", "disabled"],
  });
  group.addEventListener("keydown", onKeyDown);
  sync();
  return () => {
    observer.disconnect();
    group.removeEventListener("keydown", onKeyDown);
  };
}

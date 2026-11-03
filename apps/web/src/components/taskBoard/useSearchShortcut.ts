import { useEffect } from "react";

/**
 * "/" jumps to the Tasks search from anywhere on the page, the way most list apps do.
 * `showSearch` switches to a view that has the search box; it must be stable.
 */
export function useSearchShortcut(showSearch: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      if (event.target.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      event.preventDefault();
      showSearch();
      // From Dashboard or Roadmap the search box mounts a frame or two later.
      const focusSearch = (tries: number) => {
        const input = document.querySelector<HTMLInputElement>("[data-tasks-search]");
        if (input) input.focus();
        else if (tries > 0) requestAnimationFrame(() => focusSearch(tries - 1));
      };
      requestAnimationFrame(() => focusSearch(5));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSearch]);
}

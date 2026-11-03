import { useEffect } from "react";

/**
 * One key jumps to one Tasks field from anywhere on the page, the way most list apps do:
 * "/" for search, "n" for quick add. `show` switches to a view that has the field; it must
 * be stable. Keys typed into a field, a dialog or an open menu stay there.
 */
export function useFocusShortcut(key: string, selector: string, show: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== key || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      if (
        event.target.closest(
          "input, textarea, select, [contenteditable], [role=dialog], [role=menu], [role=listbox]",
        )
      ) {
        return;
      }
      event.preventDefault();
      show();
      // From Dashboard or Roadmap the field mounts a frame or two later.
      const focusField = (tries: number) => {
        const field = document.querySelector<HTMLElement>(selector);
        if (field) field.focus();
        else if (tries > 0) requestAnimationFrame(() => focusField(tries - 1));
      };
      requestAnimationFrame(() => focusField(5));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, selector, show]);
}

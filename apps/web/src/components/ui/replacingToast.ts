import { toastManager } from "./toast";

type ToastId = ReturnType<typeof toastManager.add>;

const replaceableToasts = new Map<string, { id: ToastId; count: number }>();

/**
 * Shows a toast in place of the open toast with the same key, so repeats never stack.
 * `build` gets how many alerts the key raised since its toast was last closed (1 for the first).
 */
export function addReplacingToast(
  key: string,
  build: (count: number) => Parameters<typeof toastManager.add>[0],
): ToastId {
  const previous = replaceableToasts.get(key);
  if (previous) toastManager.close(previous.id);
  const count = (previous?.count ?? 0) + 1;
  const options = build(count);
  const id: ToastId = toastManager.add({
    ...options,
    onClose: () => {
      options.onClose?.();
      if (replaceableToasts.get(key)?.id === id) replaceableToasts.delete(key);
    },
  });
  replaceableToasts.set(key, { id, count });
  return id;
}

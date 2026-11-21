import { useIsAiosRoot } from "../workspace/useAiosProjectRoot";

/** One more line in the project-name tooltip when the chat starts in the whole AIOS folder. */
export function AiosRootTip(props: { readonly projectRoot: string | null }) {
  const onAiosRoot = useIsAiosRoot(props.projectRoot);
  if (!onAiosRoot) return null;
  return (
    <span className="mt-0.5 block max-w-64 text-muted-foreground">
      This chat reads your whole AIOS. A project folder gives better answers for less.
    </span>
  );
}

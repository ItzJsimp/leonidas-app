import type { ScribeSuggestionList } from "@t3tools/contracts";
import { Fragment } from "react";

type SuggestionExampleData = NonNullable<ScribeSuggestionList["items"][number]["example"]>;

/** The sentence behind a suggestion: what Scribe heard and what it wrote, with the changed words marked. */
export function SuggestionExample(props: { readonly example: SuggestionExampleData }) {
  const lines = [
    ["Heard", props.example.heard],
    ["Wrote", props.example.wrote],
  ] as const;
  return (
    <dl className="mt-1.5 grid grid-cols-[2.75rem_1fr] gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      {lines.map(([label, line]) => (
        <Fragment key={label}>
          <dt className="text-2xs">{label}</dt>
          <dd>
            {line.before}
            <mark className="rounded bg-foreground/15 px-0.75 font-medium text-foreground">
              {line.changed}
            </mark>
            {line.after}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

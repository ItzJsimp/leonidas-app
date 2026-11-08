import type { FoldedFeedEvent } from "@t3tools/contracts";
import { useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { toastManager } from "~/components/ui/toast";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { useEventFeedStore } from "~/eventFeedStore";
import { NOTIFICATION_RULES, type NotificationRule, ruleGroups } from "~/notificationRules";

import { changedLabel } from "../../twoState/areaRows";
import { Tip } from "../../twoState/Tip";

/** Toast, Inbox only or Off for one event type. The change saves at once. */
export function RuleControl({
  type,
  label,
  rule,
  onPick,
}: {
  readonly type: string;
  readonly label: string;
  readonly rule: NotificationRule;
  /** Called after a change, with the rule the user had set before (null: the default). */
  readonly onPick?: (rule: NotificationRule, before: NotificationRule | null) => void;
}) {
  const setTypeRule = useEventFeedStore((store) => store.setTypeRule);
  return (
    <ToggleGroup
      aria-label={`${label}: how it reaches you`}
      value={[rule]}
      onValueChange={(next) => {
        const value = NOTIFICATION_RULES.find((option) => option.id === next[0])?.id;
        if (value === undefined || value === rule) return;
        const before = useEventFeedStore.getState().typeRules[type] ?? null;
        setTypeRule(type, value);
        onPick?.(value, before);
      }}
      className="shrink-0"
    >
      {NOTIFICATION_RULES.map((option) => (
        <Tip key={option.id} text={option.tip}>
          <Toggle value={option.id}>{option.label}</Toggle>
        </Tip>
      ))}
    </ToggleGroup>
  );
}

/** Every event type, grouped by the source that writes it, each with its rule. */
export function NotificationRules({
  events,
  now,
}: {
  /** Every feed event, turned-off types included, so they can be turned back on. */
  readonly events: ReadonlyArray<FoldedFeedEvent>;
  readonly now: number;
}) {
  const rules = useEventFeedStore((store) => store.typeRules);
  const setTypeRule = useEventFeedStore((store) => store.setTypeRule);
  const [query, setQuery] = useState("");
  const groups = useMemo(() => ruleGroups(events, rules), [events, rules]);
  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      needle === ""
        ? groups
        : groups
            .map((group) => ({
              ...group,
              rows: group.rows.filter((row) =>
                [row.label, row.type, group.source].some((text) =>
                  text.toLowerCase().includes(needle),
                ),
              ),
            }))
            .filter((group) => group.rows.length > 0),
    [groups, needle],
  );
  const custom = Object.keys(rules);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label="Search notification types"
          placeholder="Search types or sources"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1"
        />
        <Tip text="Puts every type back on its default: questions and failures pop up, the rest stay in the inbox">
          <Button
            size="sm"
            variant="ghost-muted"
            disabled={custom.length === 0}
            onClick={() => {
              const before = { ...rules };
              for (const type of custom) setTypeRule(type, null);
              const toastId = toastManager.add({
                type: "success",
                title: "Every type is back on its default",
                actionProps: {
                  children: "Undo",
                  onClick: () => {
                    for (const [type, rule] of Object.entries(before)) setTypeRule(type, rule);
                    toastManager.close(toastId);
                  },
                },
              });
            }}
          >
            Reset all
          </Button>
        </Tip>
      </div>
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No type matches.</p>
      ) : (
        shown.map((group) => (
          <section
            key={group.source}
            aria-label={group.source}
            className="rounded-xl border border-border bg-card"
          >
            <h2 className="flex items-baseline gap-2 border-b border-border px-4 py-2.5 text-sm font-semibold">
              <span className="min-w-0 truncate">{group.source}</span>
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {group.rows.length} {group.rows.length === 1 ? "type" : "types"}
              </span>
            </h2>
            <ul className="divide-y divide-border/60">
              {group.rows.map((row) => (
                <li
                  key={row.type}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-sm font-medium">
                      <Tip text={row.type}>
                        <span
                          tabIndex={0}
                          className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          {row.label}
                        </span>
                      </Tip>
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {row.lastAt === null
                        ? "None yet"
                        : `${row.count.toLocaleString("en-US")} in your notifications · newest: ${changedLabel(row.lastAt, now)}`}
                    </p>
                  </div>
                  {row.isDefault ? null : (
                    <Tip text="Back to the default rule for this type">
                      <Button
                        size="xs"
                        variant="ghost-muted"
                        onClick={() => setTypeRule(row.type, null)}
                      >
                        Reset
                      </Button>
                    </Tip>
                  )}
                  <RuleControl type={row.type} label={row.label} rule={row.rule} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

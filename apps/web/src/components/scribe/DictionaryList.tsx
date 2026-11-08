import type { ScribeDictionary } from "@t3tools/contracts";
import { PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  MANY_SPELLINGS,
  groupFixes,
  viewFixes,
  type FixGroup,
  type FixSort,
  type FixView,
} from "./dictionary.logic";
import { IconButton } from "./ScribeParts";
import { formatCount } from "./stats.logic";

type Replacement = ScribeDictionary["replacements"][number];

/** A long list shows this many rows until "Show all" is pressed. */
const FIRST_ROWS = 40;
/** A word row shows this many spellings until it is opened. */
const SPELLINGS_SHOWN = 4;

export const plural = (count: number, one: string, many: string) =>
  `${formatCount(count)} ${count === 1 ? one : many}`;

/** The bar on top of a list: select all, or what is selected and the bulk delete. */
export function SelectionBar(props: {
  readonly total: number;
  readonly selected: number;
  readonly what: string;
  readonly deleteLabel: string;
  readonly busy: boolean;
  readonly onAll: (on: boolean) => void;
  readonly onDelete: () => void;
  readonly onClear: () => void;
  readonly children?: ReactNode;
}) {
  const some = props.selected > 0;
  return (
    <div
      className={cn(
        "flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-1.5",
        some && "bg-surface-raised",
      )}
    >
      <Checkbox
        aria-label={some ? "Select none" : "Select all shown"}
        checked={some && props.selected === props.total}
        indeterminate={some && props.selected < props.total}
        onCheckedChange={(value) => props.onAll(value === true && !some)}
      />
      {some ? (
        <>
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-medium">{formatCount(props.selected)} selected</span>
            <span className="text-muted-foreground"> · {props.what}</span>
          </span>
          <Button size="sm" variant="outline" disabled={props.busy} onClick={props.onDelete}>
            <Trash2Icon aria-hidden />
            {props.deleteLabel}
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onClear}>
            Clear
          </Button>
        </>
      ) : (
        props.children
      )}
    </div>
  );
}

export function toggled(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const copy = new Set(set);
  if (!copy.delete(key)) copy.add(key);
  return copy;
}

export function FixesPane(props: {
  readonly dictionary: ScribeDictionary;
  readonly busy: boolean;
  readonly onAdd: (wrong: string, correct: string) => Promise<boolean>;
  readonly onRemove: (rules: readonly Replacement[]) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<FixView>("all");
  const [sort, setSort] = useState<FixSort>("spellings");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const groups = useMemo(
    () => groupFixes(props.dictionary.replacements),
    [props.dictionary.replacements],
  );
  const rows = useMemo(() => viewFixes(groups, query, view, sort), [groups, query, view, sort]);
  const shown = showAll ? rows : rows.slice(0, FIRST_ROWS);
  const many = groups.filter((group) => group.spellings.length >= MANY_SPELLINGS).length;
  const picked = groups.filter((group) => selected.has(group.correct));
  const pickedRules = picked.flatMap((group) =>
    group.spellings.map((wrong) => ({ wrong, correct: group.correct })),
  );
  const rulesOf = (group: FixGroup) =>
    group.spellings.map((wrong) => ({ wrong, correct: group.correct }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-48 flex-1">
          <Input
            type="search"
            aria-label="Search words and spellings"
            placeholder="Search words and spellings"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <ToggleGroup
          aria-label="Show"
          className="*:pointer-coarse:min-h-11"
          value={[view]}
          onValueChange={(next) => {
            const value = next[0];
            if (value === "all" || value === "many") setView(value);
          }}
        >
          <Toggle value="all">{`All ${formatCount(groups.length)}`}</Toggle>
          <Toggle value="many">{`${MANY_SPELLINGS} or more spellings ${formatCount(many)}`}</Toggle>
        </ToggleGroup>
        <Button aria-expanded={adding} onClick={() => setAdding(!adding)}>
          <PlusIcon aria-hidden />
          Add word fix
        </Button>
      </div>
      {adding ? (
        <AddFixForm
          busy={props.busy}
          onAdd={async (wrong, correct) => {
            const added = await props.onAdd(wrong, correct);
            if (added) setAdding(false);
            return added;
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}
      <p className="text-xs text-pretty text-muted-foreground">
        Avoid normal words, such as “cloud”. Scribe changes a misheard spelling everywhere, also
        where you mean the normal word.
      </p>
      {groups.length === 0 ? (
        <EmptyLine
          title="No word fixes yet"
          body="Add a word Scribe gets wrong and its right spelling. Scribe then fixes it every time."
        />
      ) : (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <SelectionBar
            total={shown.length}
            selected={picked.length}
            what={plural(pickedRules.length, "spelling", "spellings")}
            deleteLabel={`Delete ${plural(pickedRules.length, "spelling", "spellings")}`}
            busy={props.busy}
            onAll={(on) =>
              setSelected(on ? new Set(shown.map((group) => group.correct)) : new Set())
            }
            onDelete={async () => {
              if (await props.onRemove(pickedRules)) setSelected(new Set());
            }}
            onClear={() => setSelected(new Set())}
          >
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">
              Right spelling, then what Scribe hears
            </span>
            <Select
              modal={false}
              value={sort}
              onValueChange={(value: string | null) => {
                if (value === "spellings" || value === "name") setSort(value);
              }}
            >
              <SelectTrigger aria-label="Sort" className="w-40" size="sm">
                <SelectValue>{sort === "name" ? "A to Z" : "Most spellings"}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="spellings">Most spellings</SelectItem>
                <SelectItem value="name">A to Z</SelectItem>
              </SelectPopup>
            </Select>
          </SelectionBar>
          {rows.length === 0 ? (
            <p className="border-t border-border px-3.5 py-3 text-sm text-muted-foreground">
              No word or spelling matches “{query.trim()}”.
            </p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {shown.map((group) => (
                <FixRow
                  key={group.correct}
                  group={group}
                  busy={props.busy}
                  selected={selected.has(group.correct)}
                  open={open === group.correct}
                  onSelect={() => setSelected((current) => toggled(current, group.correct))}
                  onOpen={() => setOpen(open === group.correct ? null : group.correct)}
                  onRemove={(rules) => props.onRemove(rules)}
                  onRemoveAll={() => props.onRemove(rulesOf(group))}
                  onAddSpelling={(wrong) => props.onAdd(wrong, group.correct)}
                />
              ))}
            </ul>
          )}
          {rows.length > FIRST_ROWS ? (
            <div className="flex items-center gap-3 border-t border-border px-2 py-1.5">
              <Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>
                {showAll ? "Show fewer" : `Show all ${formatCount(rows.length)} words`}
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Showing {formatCount(shown.length)} of {formatCount(rows.length)}
              </span>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}

function FixRow(props: {
  readonly group: FixGroup;
  readonly busy: boolean;
  readonly selected: boolean;
  readonly open: boolean;
  readonly onSelect: () => void;
  readonly onOpen: () => void;
  readonly onRemove: (rules: readonly Replacement[]) => Promise<boolean>;
  readonly onRemoveAll: () => void;
  readonly onAddSpelling: (wrong: string) => Promise<boolean>;
}) {
  const { group } = props;
  const count = group.spellings.length;
  const visible = props.open ? group.spellings : group.spellings.slice(0, SPELLINGS_SHOWN);
  const hidden = count - visible.length;
  return (
    <li className={cn("px-3.5 py-2.5", props.selected && "bg-state/8")}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <Checkbox
          className="mt-0.5"
          aria-label={`Select ${group.correct}`}
          checked={props.selected}
          onCheckedChange={props.onSelect}
        />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1 sm:w-44 sm:flex-none">
          <span className="max-w-full text-sm font-medium wrap-anywhere">{group.correct}</span>
          {group.sameWord ? (
            <Tooltip>
              <TooltipTrigger render={<Badge variant="secondary" size="sm" tabIndex={0} />}>
                Same word
              </TooltipTrigger>
              <TooltipPopup className="max-w-64">
                Scribe ignores capitals when it matches, so this rule fixes capitals. It also keeps
                a shorter fix from changing this phrase.
              </TooltipPopup>
            </Tooltip>
          ) : null}
        </div>
        <div className="order-last flex w-full flex-wrap items-center gap-1 ps-7 sm:order-none sm:w-auto sm:flex-1 sm:ps-0">
          {visible.map((wrong) => (
            <span
              key={wrong}
              className="inline-flex min-h-6 max-w-full items-center gap-1 rounded-md bg-surface-raised px-2 py-0.5 text-xs text-muted-foreground"
            >
              <span className="wrap-anywhere">{wrong}</span>
              {props.open ? (
                <button
                  type="button"
                  aria-label={`Remove spelling ${wrong}`}
                  disabled={props.busy}
                  className="-me-1 grid size-5 place-items-center rounded-sm hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none"
                  onClick={() => void props.onRemove([{ wrong, correct: group.correct }])}
                >
                  <XIcon aria-hidden className="size-3" />
                </button>
              ) : null}
            </span>
          ))}
          {hidden > 0 ? (
            <Button size="xs" variant="ghost" onClick={props.onOpen}>
              +{formatCount(hidden)} more
            </Button>
          ) : null}
        </div>
        <div className="ms-auto flex items-center gap-1">
          <span className="me-1 hidden text-xs text-muted-foreground tabular-nums sm:inline">
            {plural(count, "spelling", "spellings")}
          </span>
          <IconButton
            label={props.open ? `Close ${group.correct}` : `Edit ${group.correct}`}
            onClick={props.onOpen}
          >
            {props.open ? <XIcon aria-hidden /> : <PencilIcon aria-hidden />}
          </IconButton>
          <IconButton
            label={`Delete ${group.correct} and its ${plural(count, "spelling", "spellings")}`}
            disabled={props.busy}
            onClick={props.onRemoveAll}
          >
            <Trash2Icon aria-hidden />
          </IconButton>
        </div>
      </div>
      {props.open ? (
        <AddSpellingForm correct={group.correct} busy={props.busy} onAdd={props.onAddSpelling} />
      ) : null}
    </li>
  );
}

function AddSpellingForm(props: {
  readonly correct: string;
  readonly busy: boolean;
  readonly onAdd: (wrong: string) => Promise<boolean>;
}) {
  const [wrong, setWrong] = useState("");
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2 ps-7"
      onSubmit={(event) => {
        event.preventDefault();
        if (props.busy) return;
        void props.onAdd(wrong).then((added) => {
          if (added) setWrong("");
        });
      }}
    >
      <div className="min-w-48 flex-1">
        <Input
          aria-label={`Another spelling of ${props.correct}`}
          placeholder={`Another spelling Scribe hears for ${props.correct}`}
          value={wrong}
          onChange={(event) => setWrong(event.target.value)}
        />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={props.busy}>
        Add spelling
      </Button>
    </form>
  );
}

function AddFixForm(props: {
  readonly busy: boolean;
  readonly onAdd: (wrong: string, correct: string) => Promise<boolean>;
  readonly onCancel: () => void;
}) {
  const [wrong, setWrong] = useState("");
  const [correct, setCorrect] = useState("");
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        if (!props.busy) void props.onAdd(wrong, correct);
      }}
    >
      <div className="min-w-48 flex-1">
        <Input
          autoFocus
          aria-label="Wrong word"
          placeholder="What Scribe hears, for example cooper netties"
          value={wrong}
          onChange={(event) => setWrong(event.target.value)}
        />
      </div>
      {/* On a phone the fields stack, and an arrow alone on a line reads as a stray mark. */}
      <span aria-hidden className="text-muted-foreground max-sm:hidden">
        →
      </span>
      <div className="min-w-48 flex-1">
        <Input
          aria-label="Right spelling"
          placeholder="Right spelling, for example Kubernetes"
          value={correct}
          onChange={(event) => setCorrect(event.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={props.busy}>
          Add
        </Button>
        <Button type="button" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function EmptyLine(props: { readonly title: string; readonly body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-4 text-sm">
      <p className="font-medium">{props.title}</p>
      <p className="text-muted-foreground">{props.body}</p>
    </div>
  );
}

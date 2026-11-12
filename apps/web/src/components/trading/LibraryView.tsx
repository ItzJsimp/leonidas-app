import type {
  EnvironmentId,
  TradingLibraryIndexResult,
  TradingLibraryInput,
} from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";

import { RailWindow } from "~/components/twoState/RailWindow";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";
import { useEnvironmentQuery } from "~/state/query";
import {
  tradingLibraryPageQuery,
  tradingLibrarySearchQuery,
  tradingResourceListQuery,
  tradingResourceSave,
} from "~/state/trading";
import { useAtomCommand } from "~/state/use-atom-command";

import {
  LIBRARY_SECTIONS,
  coachLink,
  coachPrompt,
  groupHits,
  type LibraryHit,
  type ResourceSaveValue,
} from "./library.logic";
import {
  CourseSection,
  EmptyLine,
  FirmsSection,
  PageList,
  PageReader,
  type PageKind,
} from "./LibrarySections";
import { FlashcardDeck, QuizSection } from "./LibraryStudy";
import { SavedView } from "./LibrarySaved";

type Index = TradingLibraryIndexResult;
const TABS = LIBRARY_SECTIONS.map((section) => ({ id: section.id, label: section.label }));

/** Waits until the value stops changing for `delay` ms, so a search runs after the trader pauses. */
function useSettled(value: string, delay: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/** The Library tab: a search box, the sections of the course pack, and the saved resources. */
export function LibraryView({
  environmentId,
  scope,
  index,
}: {
  readonly environmentId: EnvironmentId;
  readonly scope: TradingLibraryInput;
  readonly index: Index;
}) {
  const searchId = useId();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const term = useSettled(query.trim(), 150);
  const [open, setOpen] = useState<{ readonly kind: PageKind; readonly id: string } | null>(null);
  const search = useEnvironmentQuery(
    term === ""
      ? null
      : tradingLibrarySearchQuery({ environmentId, input: { ...scope, query: term } }),
  );
  const page = useEnvironmentQuery(
    open === null ? null : tradingLibraryPageQuery({ environmentId, input: { ...scope, ...open } }),
  );
  const resources = useEnvironmentQuery(tradingResourceListQuery({ environmentId, input: scope }));
  const save = useAtomCommand(tradingResourceSave, { reportFailure: false });

  const openPage = (kind: PageKind, id: string) => setOpen({ kind, id });
  const askCoach = (lessonTitle: string) => {
    void router.navigate({ href: coachLink(coachPrompt(lessonTitle)) });
  };
  const onSave = async (value: ResourceSaveValue) => {
    const result = await save({ environmentId, input: { ...scope, ...value } });
    return result._tag === "Success" ? null : "Could not save the resource. Try again.";
  };

  const body = (tab: string | undefined) => {
    if (open !== null) {
      return (
        <PageReader
          kind={open.kind}
          page={page.data ?? undefined}
          error={page.error ? "This page could not load." : null}
          loading={!page.data && !page.error}
          onBack={() => setOpen(null)}
          onAsk={askCoach}
        />
      );
    }
    if (term !== "") {
      return (
        <SearchResults
          hits={search.data?.hits ?? []}
          loading={!search.data && !search.error}
          term={term}
          onOpen={openPage}
        />
      );
    }
    switch (tab) {
      case "knowledge":
        return (
          <PageList
            pages={index.knowledge}
            kind="knowledge"
            empty="Knowledge pages show here once your course pack has them."
            onOpen={openPage}
          />
        );
      case "flashcards":
        return <FlashcardDeck cards={index.cards} />;
      case "quiz":
        return <QuizSection questions={index.quiz} />;
      case "community":
        return (
          <PageList
            pages={index.community}
            kind="community"
            empty="Community posts show here once your course pack has them."
            onOpen={openPage}
          />
        );
      case "firms":
        return <FirmsSection firms={index.firms} />;
      case "saved":
        return <SavedView resources={resources.data?.resources ?? []} onSave={onSave} />;
      default:
        return <CourseSection chapters={index.chapters} onOpen={openPage} />;
    }
  };

  return (
    <RailWindow title="Library" tabs={TABS}>
      {(tab) => (
        <div className="flex min-w-0 flex-col gap-4 p-4">
          {index.status === "invalid" ? (
            <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
              The linked pack did not load: {index.reason}. Fix trading-pack.json in the pack
              folder. Saved resources still work.
            </p>
          ) : null}
          {index.status === "none" ? (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              No course pack is linked. To link one, set the pack folder as crewPack in the Trading
              workspace file (workspace.json). Then open this tab again. Saved resources work
              without a pack.
            </p>
          ) : null}
          <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor={searchId}>Search the Library</Label>
            <Input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(null);
              }}
              maxLength={200}
              placeholder="Search lessons, pages, cards and posts"
            />
          </div>
          {body(tab)}
        </div>
      )}
    </RailWindow>
  );
}

function SearchResults({
  hits,
  loading,
  term,
  onOpen,
}: {
  readonly hits: readonly LibraryHit[];
  readonly loading: boolean;
  readonly term: string;
  readonly onOpen: (kind: PageKind, id: string) => void;
}) {
  if (loading) return <Spinner size="sm" aria-label="Searching the Library" />;
  const groups = groupHits(hits);
  if (groups.length === 0) return <EmptyLine>Nothing in the Library matches "{term}".</EmptyLine>;
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.kind} aria-labelledby={`library-hits-${group.kind}`}>
          <h2 id={`library-hits-${group.kind}`} className="mb-1 text-sm font-medium">
            {group.label}
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {group.hits.map((hit) => {
              const pageKind = hit.kind === "card" ? null : hit.kind;
              return (
                <li key={`${hit.kind}-${hit.id}`} className="py-2">
                  {pageKind === null ? (
                    <p className="text-sm font-medium">{hit.title}</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpen(pageKind, hit.id)}
                      className="text-start text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {hit.title}
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground">{hit.snippet}</p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

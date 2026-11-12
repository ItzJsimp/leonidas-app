import type { TradingLibraryIndexResult, TradingLibraryPageResult } from "@t3tools/contracts";
import type { ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

import { firmNotice, type LibraryFirm } from "./library.logic";

type Index = TradingLibraryIndexResult;
type Lesson = Index["chapters"][number]["lessons"][number];
export type PageKind = "lesson" | "knowledge" | "community" | "firm";

/** The line that shows when a section has nothing yet. It says what the tab is for. */
export function EmptyLine({ children }: { readonly children: ReactNode }) {
  return <p className="px-1 py-6 text-sm text-muted-foreground">{children}</p>;
}

export function CourseSection({
  chapters,
  onOpen,
}: {
  readonly chapters: Index["chapters"];
  readonly onOpen: (kind: PageKind, id: string) => void;
}) {
  if (chapters.length === 0) {
    return (
      <EmptyLine>
        The course lessons show here. Link your course pack to read them, with their key words.
      </EmptyLine>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {chapters.map((chapter, index) => (
        <section
          key={`${chapter.number}:${chapter.title}`}
          aria-labelledby={`library-chapter-${index}`}
        >
          <h2 id={`library-chapter-${index}`} className="mb-1 text-sm font-medium">
            {chapter.number === "" ? "" : `${chapter.number}. `}
            {chapter.title}
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {chapter.lessons.map((lesson) => (
              <LessonRow key={lesson.id} lesson={lesson} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function LessonRow({
  lesson,
  onOpen,
}: {
  readonly lesson: Lesson;
  readonly onOpen: (kind: PageKind, id: string) => void;
}) {
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <button
        type="button"
        onClick={() => onOpen("lesson", lesson.id)}
        className="min-w-0 flex-1 text-start text-sm font-medium underline-offset-4 hover:underline"
      >
        {lesson.title}
      </button>
      {lesson.duration === "" ? null : (
        <span className="text-xs text-muted-foreground tabular-nums">{lesson.duration}</span>
      )}
      {lesson.keywords.length === 0 ? null : (
        <span className="text-xs text-muted-foreground">
          Key words: {lesson.keywords.join(", ")}
        </span>
      )}
      {lesson.hasTranscript ? null : (
        <span className="text-xs text-muted-foreground">No transcript</span>
      )}
      {lesson.url === null ? null : (
        <a
          href={lesson.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs underline underline-offset-4"
        >
          Watch on Whop
        </a>
      )}
    </li>
  );
}

/** A list of pages. Each row opens its text in the reader. */
export function PageList({
  pages,
  kind,
  empty,
  onOpen,
}: {
  readonly pages: ReadonlyArray<{ readonly id: string; readonly title: string }>;
  readonly kind: "knowledge" | "community";
  readonly empty: string;
  readonly onOpen: (kind: PageKind, id: string) => void;
}) {
  if (pages.length === 0) return <EmptyLine>{empty}</EmptyLine>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {pages.map((page) => (
        <li key={page.id}>
          <button
            type="button"
            onClick={() => onOpen(kind, page.id)}
            className="w-full py-2 text-start text-sm font-medium underline-offset-4 hover:underline"
          >
            {page.title}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function FirmsSection({ firms }: { readonly firms: readonly LibraryFirm[] }) {
  if (firms.length === 0) {
    return <EmptyLine>Firm rules show here. Link your course pack to read them.</EmptyLine>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {firms.map((firm) => {
        const notice = firmNotice(firm);
        return (
          <li key={firm.id} className="flex flex-col gap-1 py-3">
            <h2 className="text-sm font-medium">{firm.name}</h2>
            <p
              className={cn(
                "text-sm",
                notice.tone === "stale"
                  ? "font-medium text-destructive-foreground"
                  : "text-muted-foreground",
              )}
            >
              {notice.text}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** One page of text. A lesson also offers the coach. */
export function PageReader({
  kind,
  page,
  error,
  loading,
  onBack,
  onAsk,
}: {
  readonly kind: PageKind;
  readonly page: TradingLibraryPageResult | undefined;
  readonly error: string | null;
  readonly loading: boolean;
  readonly onBack: () => void;
  readonly onAsk: (lessonTitle: string) => void;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 text-sm font-medium">
          {page?.title ?? (loading ? "Loading" : "Page")}
        </h2>
        <Button variant="outline" size="sm" onClick={onBack}>
          Back to the list
        </Button>
      </div>
      {error !== null ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error}
        </p>
      ) : null}
      {page === undefined || error !== null ? null : (
        <>
          {kind === "lesson" ? (
            <div>
              <Button size="sm" onClick={() => onAsk(page.title)}>
                Ask the coach about this lesson
              </Button>
            </div>
          ) : null}
          <div className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed">
            {page.text.trim() === "" ? "Nothing to show here yet." : page.text}
          </div>
          {page.truncated ? (
            <p className="text-xs text-muted-foreground">Shown up to 200,000 characters.</p>
          ) : null}
        </>
      )}
    </article>
  );
}

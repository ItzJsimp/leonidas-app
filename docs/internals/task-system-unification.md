# Task system unification: Command Center into Leonidas

Decision: Leonidas's Tasks page becomes the only task UI and the only writer. The AIOS Command Center Tasks tab (`projects/leonidas-command-center`) is folded in and then retired. No data migration is needed, because both already read the same files.

## Why no migration

Both apps treat one markdown card per task in the AIOS `tasks/` folder as the record. Command Center reads it through `Get-Tasks.ps1` and writes through `server/task-write.ts`. Leonidas reads it through `apps/server/src/taskBoard/aiosCards.ts` (`cardToTask`) and rewrites only the lines it changes. The "Notion-style" part is the typed-property schema in `config/task-schema.json` (select, status, person, multi_select, date, checkbox, with option colors), plus saved views in `config/task-views.json`. The merge ports behavior onto `TaskBoardTask`; it does not copy rows.

## What Command Center has that Leonidas lacks

- **Fields:** `lane`, `accountable`, `scope`, `autonomous`, `tags`, `owner` (tenant repo) and the computed rank (`isBlocked`, `unblocksCount`, `score`). Code's contract carries none of them yet.
- **Saved views** (`DEFAULT_VIEWS` in `src/tasks-view.ts`): Today (critical, in progress or due within 7 days), Deadlines, Triage, Quick wins, Blocked, Stagnant, Completed, By owner, By project, Eisenhower matrix and Focus queue, plus `nextMoves`.
- **Table features:** column order and width, footer calculations, a WIP limit of 7, a Dormant rule (7 days untouched), and a content-hash conflict check on write.

## Mapping decisions

- **Statuses:** Not started to `todo`, In progress to `in_progress`, Awaiting Review to `review`, Dormant to `parked`, Blocked, Done and Retired map one to one. Priorities map one to one.
- **Standard rail wins:** Inbox, Today, Upcoming and All tasks stay as Code defines them (Today is due today or overdue). Command Center's "Today" meaning moves to a saved view named Needs attention, so the two definitions do not collide.
- **Project filter:** keep Code's dynamic project rail. Drop Command Center's seven hard-coded chips and take project colors from the schema file.
- **Layouts:** table maps to List, board maps to Board, matrix is the one new layout (a Board or Dashboard variant). Roadmap stays Code-only.

## Order of work

1. **Parity proof, no UI:** run `cardToTask` over every card in `tasks/` and assert nothing is dropped and unchanged cards round-trip byte-identical. This is the gate for everything after.
2. **Contract:** add the optional fields above to `TaskBoardTask` and the card patch. Unknown keys are already preserved by the line-level rewrite.
3. **Views as data:** port `filterByView`, `eisenhowerQuadrant` and `nextMoves` as pure functions in `taskBoard.logic.ts` with tests, and read view definitions from `task-views.json` so both apps agree during the overlap.
4. **Single writer:** Command Center's Tasks tab becomes a link or redirect into `/tasks`. Its `/api/tasks` write routes stay only while Hermes or scripts still call them, then go.
5. **Retire** the Command Center Tasks tab once steps 1 to 4 pass in a real client.

## Open decisions

- **Native tasks vs cards:** Code's native tasks live in its own store, not in `tasks/`. "All tasks in one place" needs a rule for which new tasks become cards (recommended: tasks tied to an AIOS project become cards, personal and task-only ones stay native, and the page merges both).
- **Concurrency:** Command Center checks a content hash and commits batched `Task:` commits; confirm Code's patch path gives the same protection before it is the only writer.

Analysis is from source (`tasks-view.ts`, `task-write.ts`, the two config files, `aiosCards.ts`, the contracts). Command Center was not run for this.

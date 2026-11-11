# Spec: Group Chats by Account in Sidebar

## Objective

Add a new "Account" grouping option to the Leonidas chat list sidebar View menu. This allows users with multiple connected provider instances (e.g., personal Claude, work Anthropic, Codex, local models) to view their chats neatly organized per account, with groups ordered by recent activity.

## Commands

- **Tests:** `vp test run apps/web/src/components/sidebar/sidebarView.logic.test.ts`
- **Lint:** `vp lint apps/web/src/components/sidebar/sidebarView.logic.ts apps/web/src/components/sidebar/SidebarViewMenu.tsx apps/web/src/components/Sidebar.tsx`
- **Typecheck:** `cd apps/web && tsc --noEmit`
- **Constraints:** Floor checks (lint, fmt, typecheck, secrets, em dash) before commit.

## Touched areas

- `apps/web/src/components/sidebar/sidebarView.logic.ts`: Add `"account"` to `SidebarGroupBy`, `GROUP_BY_VALUES`, and implement account grouping in `groupSidebarThreads`.
- `apps/web/src/components/sidebar/SidebarViewMenu.tsx`: Add the `Account` option to the `Group by` segmented control.
- `apps/web/src/components/Sidebar.tsx`: Pass account lookup / display names to `groupSidebarThreads`.
- `apps/web/src/components/sidebar/sidebarView.logic.test.ts`: Add tests for grouping threads by account, handling empty groups, and "Other" fallback.

## Testing strategy

- Unit tests in `sidebarView.logic.test.ts` validating:
  - Parsing stored view with `groupBy: "account"`.
  - Grouping threads by account instance with correct labels.
  - Sorting account groups by most recent activity.
  - Unmatched threads assigned to "Other".
- Typecheck verification for the web app to ensure zero TypeScript errors.

## Boundaries

- **Always:** Preserve full backward compatibility for existing stored sidebar views (`date`, `status`, `project`, `classic`).
- **Ask first:** Running full browser UI test suite via `test-t3-app`.
- **Never:** Modify files in `.repos/`. Do not alter thread storage or wire contracts.

## Success criteria

1. `SidebarGroupBy` accepts `"account"` and parses successfully from localStorage. (PASS)
2. The View options popover displays `Account` with description `One group for each connected account`. (PASS)
3. When `Account` is selected, active threads are grouped by their account instance display name. (PASS)
4. Groups are ordered by most recent activity within each account group. (PASS)
5. Threads lacking a known account instance are grouped under `Other`. (PASS)
6. Unit tests pass cleanly. (PASS)

## Not doing

- Grouping at the vendor/provider family level (user chose account instance granularity).
- Custom manual drag ordering of account groups (groups are recency-ordered).

## Open questions

none

## Slices

### Slice 1: Account grouping logic and tests

- **Scope:** `apps/web/src/components/sidebar/sidebarView.logic.ts`, `apps/web/src/components/sidebar/sidebarView.logic.test.ts`
- **Status:** Complete (commit `281ba5bf12`)

### Slice 2: View menu UI and Sidebar integration

- **Scope:** `apps/web/src/components/sidebar/SidebarViewMenu.tsx`, `apps/web/src/components/Sidebar.tsx`
- **Status:** Complete (commit `844c81a97b`)

## Workflow

- [x] Phase 1: Define (grill complete)
- [x] Phase 2: Spec (Gate 1 approved)
- [x] Phase 3: Plan (2 slices scheduled)
- [x] Phase 4: Build (both slices committed)
- [x] Phase 5: Test (PASS, 14/14 tests)
- [x] Phase 6: Review (PASS, 0 findings)
- [x] Phase 7: Ship (Gate 2 approved, shipped)

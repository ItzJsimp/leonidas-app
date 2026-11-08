# Catch-up: chat dependency closure (research, 2026-11-08)

Method: breadth-first import walk on `upstream/main`. Start files: the 4 chat files plus every non-test `.ts` and `.tsx` file under `apps/web/src/components/chat/`. Follow relative and `~/` imports. Stop at `node_modules` and at `@t3tools/*` packages. Compare with `origin/main` (`5b0249667e`). Script and raw list: `C:/lcw/_scratch-b15/research/closure.py` and `closure.json` (may be wiped).

## Result

| Measure | Count |
| --- | --- |
| Files in the closure (all in `apps/web`) | 967 |
| Closure files that do not exist in Leonidas | 250 |
| Closure files that Leonidas changed since the base | 336 |
| Closure files that Leonidas has unchanged | 381 |

Missing files by folder: `components` 186, `lib` 19, `hooks` 15, `speech` 10, `state` 7, others 13. Changed files by folder: `components` 275, `hooks` 12, `lib` 7, `state` 6, `browser` 5, `connection` 3.

Workspace imports found (import statements, not files): `@t3tools/client-runtime` 724, `@t3tools/contracts` 577, `@t3tools/shared` 293, `@t3tools/provider-core` 1, `@t3tools/secret-provider-definitions` 1, `@t3tools/secret-provider-onepassword` 1.

## Missing files that matter (examples)

- Chat shell: `ChatBannerLane.tsx`, `ChatOverlayHosts.tsx`, `ChatRightPanel.tsx`, `ChatTerminalDrawers.tsx`, `ThreadTimeline.tsx`, `TimelineOverlays.tsx`, `SideChatPane.tsx`.
- Composer: `ComposerControlsBar.tsx`, `ComposerAttachmentStrip.tsx`, `ComposerFreshSession.tsx`, `ComposerModelEffort.tsx`, `ComposerSpeechButton.tsx`, `useComposerAttachmentIntake.ts`.
- Timeline: `TimelineUserMessageRow.tsx`, `TimelineV2EventRow.tsx`, `TimelinePendingApprovalRow.tsx`, `TimelineRowParts.tsx`. Leonidas has its own files with similar names (Batch 15). They are different code.
- Markdown: `MarkdownCodeBlock`, `MarkdownMath`, `MarkdownMermaidCodeBlock`, `MarkdownTable`, `MarkdownFileLink`.

## Server and contracts needs

- **New packages:** `packages/secret-provider-definitions` (3 files) and `packages/secret-provider-onepassword` (6 files) do not exist in Leonidas. The closure imports both.
- **Packages changed since the base (upstream vs Leonidas):** contracts 117 vs 74 files, shared 245 vs 111, client-runtime 381 vs 109, `apps/server` 1,421 vs 720. A chat stage cannot land without the matching contracts and client-runtime stage.
- **Migrations:** upstream has migrations up to `080_ScheduledTaskThreadMode`. Leonidas stops at `066_ActiveTurnItemIndexes`. Upstream added 16 numbered migration files (067 to 080) plus changes in `OrchestrationV2/`. Leonidas added none after 066, so numbers do not collide. They must run in order.
- **New RPC or settings:** not listed one by one. The 7 conflicting port-through commits in Batch 15 name the first ones (secret providers, managed policy, sidebar settings). Use the stage dry runs to list the rest.

## Answer to the question

The closure is 967 web files. Over a quarter (250) are new to Leonidas and over a third (336) were changed by Leonidas. It needs server, contracts, shared and client-runtime changes from the same stage. A chat-only merge is not possible. Merge the whole tree stage by stage.

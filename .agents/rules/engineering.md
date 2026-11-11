# Engineering guide (Leonidas Code)

Read before changing code. Leonidas Code is a Node WebSocket server that wraps provider CLIs and agents (Codex, Claude, Cursor, Grok, OpenCode, Antigravity) and serves web, desktop and mobile clients. Forked from T3 Code (MIT); internal ids `@t3tools/*`, `T3CODE_*`, `~/.t3` stay for data safety.

## Principles

- **Elevate UX, DX, and AX.** Make the best decision that will elevate all three: the user experience (UX), developer experience (DX), and agent experience (AX) always, without breaking anything.
- **Performance without compromise.** Watch websocket payload size, GPU-heavy CSS animation, and long-list rendering. No continuously repainting animations. Every change passes `performance-gate`.
- **Smallest correct model.** Understand the real constraint first. Do not keep complexity because it exists, and do not add machinery because it looks impressive. Measure twice, cut once; YAGNI.
- **Prompts the app writes for agents go through `prompt-composer`.** Load that skill before changing any generated agent prompt (System Care lives in `apps/server/src/hardwareWatch/SystemCare.ts`). The checkable rubric is `promptAudit.ts`; its test must stay at 100 for every prompt variant.
- **Cheap reads.** Canon rule 21 in the AIOS root `AGENTS.md` applies here. Repo detail: check a search count with `grep -c` first, cap lines with `| cut -c1-140 | head -40`, and use `rtk read -l aggressive` only to skim (it drops content).
- **Remote ready.** Local network, Tailscale and tunnel connections are core. New features must work over all of them.
- **Multi-surface.** Web (hosted and local `npx`), desktop (Electron, also a host server) and mobile (React Native).
- These are good defaults, not hard rules. If one fights the task, say so loudly and get human sign-off before breaking it.

## Glossary

- **user:** the person directing agents in the app. **agent:** a coding agent run inside it (may include you).
- **provider:** the agent runtime the app talks to. **client:** web, desktop or mobile UI.
- **environment:** one running server plus its machine, filesystem, credentials and state.
- **project:** an environment-local workspace rooted at a directory. **thread:** durable conversation and work history. **turn:** one user-to-agent cycle including checkpointing.
- **home:** base data directory; runtime state lives under its `userdata`.

## Hit every surface

The most common defect is a change that works on the tested path and is missing elsewhere. Before calling frontend work done, say which of these applied:

- **Entry points:** chat view, Settings, command palette, keybinding.
- **Clients:** web, desktop (Electron shell/IPC), mobile. Shared logic: `packages/client-runtime`.
- **Providers:** each adapter needs a decision, even "not supported here".
- **Agents:** user capabilities should be service methods reachable through MCP tools and scheduled tasks.
- **Contracts:** wire types live in `packages/contracts`; change the schema and every client follows.
- **Reverse states:** a way in needs a way out and a way to see it (snooze/unsnooze, close/reopen).
- **Connection modes:** local, remote/relay and tunnel differ; multi-device is real.
- **Docs:** check whether existing guidance became wrong.

## Dev servers

- `vp i` installs. `vp run dev` starts server and web; in a worktree, state defaults to its gitignored `.t3`. An explicit `--home-dir` wins.
- Ports derive from the worktree path; read real ones from the `[dev-runner]` line.
- Tailnet sharing: run `vp run dev --share` in the background, wait for `pairingUrl:`, hand that URL to an unpaired browser. Never wire `tailscale serve` by hand or consume the user's pairing link. Fresh token: `node apps/server/src/bin.ts pair`.
- Shared dev auth: one `T3CODE_DEV_AUTH_TOKEN` in the main checkout's gitignored `.env`. Never commit a token or startup URL. See `docs/operations/development.md`.
- Stop only what you started, by the PID you captured.

## Test data

- Seed with `vp run migrate-dev-db` (dev server stopped). It rebuilds `<worktree>/.t3/userdata/statev2.sqlite` from a read-only snapshot of real data and drops scheduled tasks, pending work and auth sessions.
- Refresh `statev2.sqlite`, not `state.sqlite`. Bring `secrets` and `settings.json` only if the flow needs them. Copy in, never symlink.

## Verifying

- Smallest proof: `vp test run <files>`, scoped lint and typecheck. Never run repo-wide `vp check`, `vp run -r test` or `vp run -r typecheck` unless asked; CI owns the full suite.
- Test logic or observable behavior; no static-markup prop assertions or tests that mirror the implementation.
- Backend behavior changes ship with focused tests. The server is event-sourced: drain `OrchestrationEffectWorkerV2.drain` or await the persisted event or `Deferred`. A test that needs a timeout is wrong.
- UI changes get one integrated pass when asked: `test-t3-app` (web) or `test-t3-mobile` (mobile), by the primary agent only. Ask before computer use or browsers.
- Missing mobile native client is a build step: `node scripts/mobile-native-client.ts ensure <ios|android> <device-id>`.

## Pull requests

- Only when explicitly asked. Conventional plain titles: `fix(web): new threads no longer spike CPU`.
- Body: problem in 1-2 sentences, then the fix, then model and harness used. UI changes need before/after images; motion needs a short video uploaded to GitHub, never committed.
- One request, one PR. When babysitting: verify each bot finding against source, fix real ones, dismiss false ones with a reason, stop when green.

## Documentation

- `docs/internals/`: decisions, cross-component constraints, hard-to-discover traps. Ask what a maintainer would get wrong without it; otherwise leave it out. Rewrite changed decisions, never append.
- `docs/user/`: one concise section per major feature in product voice. `docs/operations/`: maintainer setup, release, debugging.
- No committed plans, research notes or scratch files; keep them outside the worktree.

## How it works

Clients send typed WebSocket requests; the server turns them into commands. The orchestrator (`apps/server/src/orchestration-v2/Orchestrator.ts`) serializes commands and decides events with no I/O. The event sink commits events, projections, receipts and outbox effects in one transaction; the effect worker runs effects and feeds results back as commands. Provider CLIs run as subprocesses behind per-provider adapters. Each turn ends with a checkpoint (hidden git ref). Detail: `docs/internals/overview.md`, `docs/internals/glossary.md`.

## Where code lives

- `apps/server`: WebSocket, orchestration, providers, checkpointing. Read `docs/internals/effect-services.md` and `.repos/effect-smol/LLMS.md` first.
- `apps/web` (React/Vite), `apps/desktop` (wraps web), `apps/mobile` (React Native), `apps/marketing`.
- `packages/contracts` (schemas, no heavy logic), `packages/shared` (subpath exports, no barrel), `packages/client-runtime` (web + mobile).
- `.repos/`: vendored read-only references. Never edit or import; sync with `vpr sync:repos`.

## Taste

- Complexity at the adapter boundary; orchestration pure; UI dumb.
- Client mutations use `createEnvironmentRpcCommand`; protected methods go in `CLIENT_GUARDED_RPC_SCOPES` with a `permissionAtom`; extend permission tests.
- Server features are services; transports decode, call one method, map errors.
- `components/ui` owns its look: pick `variant`/`size`, never restyle via `className`; layout classes go on the parent (`shadcn/no-restyle` lint). See `docs/internals/web-ui.md`.
- Inferred types over annotations; no `any`. Comments describe usage, mostly on functions.
- Security matters but is not over-indexed for dev-only features.

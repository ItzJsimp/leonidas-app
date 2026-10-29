# Leonidas Code on a phone: paths and options

Date: 2026-10-28. Read-only research. No code changed, no app installed.

Method: `git fetch upstream`, then `git show upstream/main:<path>`. Upstream head was `7b87466731` (2026-10-29). Our merge base is `8d199b4f7b` (2026-10-11). Our `main` has taken no upstream commit since that base. Upstream is 2828 commits ahead. 613 of them touch `apps/mobile`.

Facts about Jake's setup (read with `tailscale status`):

- Tailscale is installed on the desktop and laptop.
- An iPhone 13 (`iphone-13`) is on the same tailnet. It showed `offline, last seen 9d ago`.
- The target phone is therefore an iPhone. The laptop and desktop run Windows. There is no Mac.

## Summary table

| Path                                                   | Cost                                                      | Effort                                                        | UX quality                                                          | Risk                                                                                  | Evidence                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A. Phone browser to the Leonidas web UI over Tailscale | $0                                                        | About 15 min                                                  | Medium. Sidebar becomes a sheet under 768 px. Not tested at 390 px. | Low                                                                                   | `docs/user/remote-access.md:146-172`, `apps/web/src/hooks/useMediaQuery.ts:85`                                   |
| B. Same web UI, added to the Home Screen               | $0                                                        | About 5 min after A                                           | Medium. Opens full screen. No offline mode.                         | Low                                                                                   | `apps/web/public/manifest.webmanifest` (`display: standalone`, 180 px icon), no service worker in `apps/web/src` |
| C. Official T3 Code iOS app, paired to our server      | $0                                                        | About 20 min                                                  | High (native). Shows T3 branding. No Leonidas features.             | Medium. Works today (protocol 2 on both sides) but can break at any App Store update. | `docs/user/remote-access.md:47-82`, `packages/client-runtime/src/connection/compatibility.ts:9-27`               |
| D. Official app through T3 Connect                     | $0                                                        | Medium. Needs T3's public keys in our build.                  | High                                                                | High. Uses T3's relay. Policy not confirmed.                                          | `docs/user/faq.md:28`, `.env.example`, `docs/operations/connect-setup.md:9-35`                                   |
| E. Our own Leonidas iOS build (Expo, EAS, TestFlight)  | $99 per year (Apple). EAS free plan: 30 builds per month. | Days. First build 1 to 3 days. Each upstream merge adds more. | Highest. Native, Leonidas name, Leonidas features.                  | High effort. Low compat risk, because the app matches our server.                     | `apps/mobile/app.config.ts:70-100, 242-258, 496-499`, `apps/mobile/eas.json`                                     |
| F. Our own Android APK                                 | $0 for sideload. $25 once for Google Play.                | Days. Same branding work as E.                                | Highest                                                             | Not useful today: Jake has an iPhone                                                  | `docs/user/install.md:143-146`, `apps/mobile/eas.json` (`preview:dev` builds an APK)                             |

## 1. How the mobile app reaches a desktop server

The phone is a remote. The computer runs the agents and must stay on (`docs/user/faq.md:44`). The app supports four routes (`docs/user/remote-access.md`):

- **Pairing link on LAN or private network** (lines 47-82). The host turns on **Network access**, or runs `t3 serve --host <private-ip>`. It makes a one-time link with `t3 pair`. The phone scans the QR code or pastes the URL into **Add environment**. The `t3code://pair` app link is for a computer that has the desktop app (line 73). The mobile app also reads `t3code://pair?pairingUrl=...` (`apps/mobile/src/lib/appLinking.test.ts:15`).
- **Tailscale HTTPS** (lines 146-172). Run `t3 serve --tailscale-serve` or `t3 pair --tailscale`. The link uses `https://<machine>.<tailnet>.ts.net/`. Both devices must be on the same tailnet. Our web settings already have a "Tailscale HTTPS" switch (`apps/web/src/components/settings/ConnectionsSettings.tsx:3551`), and our CLI has `pair` (`apps/server/src/cli/pair.test.ts`).
- **T3 Connect** (lines 6-33). Clerk sign-in plus a Cloudflare tunnel. T3's relay brokers the link and does not proxy traffic (`docs/internals/t3-connect.md:1-6`). It needs Clerk keys and a relay URL in the build (`docs/operations/connect-setup.md:16-23`).
- **SSH**. Only for the desktop app. Not for a phone.

One machine can have many routes. The app tries the fastest first and moves back when an earlier one works again (`remote-access.md:87-119`).

Server side needs: a reachable address, a pairing credential, and a server that answers the protocol. For plain `http://` addresses, the live device video falls back to still images on iOS (`docs/user/devices.md:94-97`). Use HTTPS (Tailscale Serve) to avoid that.

## 2. Can the official App Store app use a Leonidas Code server?

Short answer: it should connect today. It is not a safe long-term path. I did not run the app, so "should" is from code reading only.

What matches:

- **Protocol version.** `ORCHESTRATION_PROTOCOL_VERSION = 2` in upstream and in our `main` (`packages/contracts/src/environment.ts:13`). It has been 2 since 2026-10-02 (`de34391427`), before our base. The client gate passes when the numbers are equal (`packages/client-runtime/src/connection/compatibility.ts:13-16`).
- **Newer app, older server is a designed case.** Upstream clients fall back when a server is old. Example: the new client asks `/api/auth/websocket-ticket/rpc`, and on a 404 it retries the old route (`packages/client-runtime/src/authorization/remote.ts:189-208`). Our server only has the old route (`packages/client-runtime/src/authorization/remote.ts:170` on our `main`). Auth `permissions` have a legacy fallback too (`docs/internals/environment-auth.md:93-99`).
- **Store app and Nightly servers both work** (`docs/user/install.md:141`). That shows T3 tests newer apps against older servers.

What would break or degrade:

1. **A protocol bump.** If upstream sets the version to 3, the app shows "This client requires a newer server" and refuses to connect (`compatibility.ts:22-26`). The App Store updates the app on its own. We cannot hold it back. This is the main risk.
2. **RPC methods our server lacks.** I compared `WS_METHODS` in `packages/contracts/src/rpc.ts`. Upstream has 185 methods. Ours has 293. Upstream has 19 that we lack, such as `peerLinks.*`, `guestShare.create`, `pullRequests.reviewGuide`, `sourceControl.signIn*`. The mobile app references `peerLinks` and `guestShare` in 13 files. Those features (linked environments) are behind a Labs flag, so expect errors only if Jake turns them on. I did not confirm the flag in code.
3. **Changed payloads.** Upstream commits `abd9d9f970` (thread open loads 85% less data) and `e57c093cdd` (cold connects skip old settled threads) add optional flags such as `workspaceSnapshotsOnDemand` and `providerWorkspaceSnapshotsOnDemand`. The contract comment says older servers send everything, so this should still work. It is untested with our server. Expect slower thread opens, not failures.
4. **Our extra features are invisible.** The official app does not know our 100+ extra methods (`taskBoard.*`, `scribe.*`, `savedItems.*`, `subagents.*`, `images.*`). Our added settings fields (`settings.ts` +310 lines) are untested against its decoder. If the decoder is strict, settings can fail to load. I did not verify this.
5. **Branding and identity.** The app says "T3 Code". Fine for personal use.
6. **No Connect.** Our `.env` has no Clerk keys, so the server cannot join T3 Connect. See path D.

Test that proves or kills path C: pair once, open a thread, send one message, open Settings. About 20 minutes.

## 3. Our own mobile build from `apps/mobile/`

It is possible. The code is Expo 58 (`apps/mobile/package.json:84`) with three variants: development, preview, production (`app.config.ts:70-100`). We already rebranded the app names to "Leonidas Code" and added 29 commits of our own to `apps/mobile` (palette, task Inbox/Today/Upcoming, provider failover).

Costs:

- **Apple Developer Program: $99 per year.** Needed for TestFlight and for any build that runs on a real iPhone beyond 7 days. A free Apple ID gives a profile that expires in about 7 days, 3 devices, and no TestFlight ([forum summary](https://developer.apple.com/forums/thread/47463)). We have no Mac, so the free Xcode route is not open anyway. The README's Personal Team route needs Xcode (`apps/mobile/README.md:82-90`).
- **EAS (Expo build cloud).** Free plan: 30 builds per month, low-priority queue, 45 minute limit, per [Expo pricing](https://expo.dev/pricing). The split between iOS and Android is disputed in sources (15 and 15, or 30 Android or 15 iOS). Check the live page. Paid plans start near $19 to $99 per month. Sources disagree. Not needed for one phone.
- **Google Play:** $25 one time ([Play Console help](https://support.google.com/googleplay/android-developer/answer/6112435)). Not needed. An APK sideload is free (`eas.json` `preview:dev` has `buildType: apk`).

Branding and ownership work (all in `apps/mobile/app.config.ts`):

- `owner: "pingdotgg"` (line 499) and EAS `projectId` `d763fcb8-...` (line 496). Replace with Jake's Expo account and a new project.
- OTA update URL `https://u.expo.dev/d763fcb8-...` (line 244). Replace, or set `T3CODE_MOBILE_UPDATES_ENABLED=0`.
- `appleTeamId: "ARK85ZXQ4Z"` (line 258) and `associatedDomains` on `clerk.t3.codes` (line 259). Replace with Jake's team, or remove.
- Bundle ids `com.t3tools.t3code*` and Android package (lines 70-100). Change to a Leonidas id, for example `com.leonidas.code`. The internal id rule in `LEONIDAS.md` keeps `com.t3tools.t3code` for the desktop app only. The phone app has its own store identity.
- Widgets and the share extension need App Groups under Jake's team (`app.config.ts:123-205`). Drop them first to ship sooner.
- Telemetry: `tracesUrl` defaults to Axiom, but the token defaults to `null` (lines 453-455). No data leaves unless a token is set.
- Clerk and Connect: optional and off in a fresh clone (`apps/mobile/README.md:19-21`). Leave off.

Effort in steps:

1. Make a free Expo account, create the EAS project, enroll in the Apple program (up to 48 hours for approval, per general reports).
2. Edit the config items above.
3. `eas build -p ios --profile production`, then `eas submit` to TestFlight. Internal TestFlight testers need no App Review.
4. Install TestFlight on the iPhone. Pair to the server as in path C.

Compat note: our copy of `apps/mobile` is from Oct 11 and uses our Oct 11 contracts. It matches our server exactly, so protocol drift is zero. The drift comes later, when we merge upstream mobile commits (they need matching server and contract code).

Not verified: that the Oct 11 mobile tree still builds with EAS today, and that `eas.json` image `macos-tahoe-26.6-xcode-27.1` is still available.

## 4. Web UI over Tailscale as a zero-cost path

Yes, it is usable, and it is also the first step of path C.

- **Server.** The server hosts the web bundle. Reach it on the tailnet by `t3 serve --host <tailnet-ip>`, or by `t3 serve --tailscale-serve` for HTTPS (`remote-access.md:55-61, 146-172`). On desktop, use **Settings > Sharing & access**. Our UI has Network access and Tailscale HTTPS switches (`ConnectionsSettings.tsx:3188, 3551`). Tailscale Serve may need HTTPS certificates enabled in the Tailscale admin page. I did not check that setting.
- **Secure context.** Plain `http://100.x.x.x` is not a secure context. Device video falls back to stills on iOS (`devices.md:94-97`). Use the HTTPS route when you can.
- **Phone layout.** `useIsMobile()` is `max-md`, which is under 768 px (`apps/web/src/hooks/useMediaQuery.ts:85`). The sidebar then becomes a slide-over sheet. The right panel goes inline under 980 px (`rightPanelLayout.ts:1`). The viewport meta uses `viewport-fit=cover` and `interactive-widget=resizes-content` (`apps/web/index.html:6-8`). Our own narrow-screen fixes: `7b89815697` (composer bar scrolls), `93eec0f899`, `7838b48201`, `5d2a16751a` (team tables stack).
- **Upstream web work we lack.** `#24847` (`3faeb9e6f9`, 2026-10-25) moves Settings and Usage into large modals over the thread and reworks the mobile sidebar logic. `34c5a6d446` (software keyboard check before composer Enter) fixes Enter on phone keyboards. Upstream tests a 390 x 844 phone in `softwareKeyboard.test.ts` and `previewMiniPlayerLayout.test.ts`. Neither commit is in our `main`.
- **Home Screen app.** `manifest.webmanifest` sets `display: standalone` with a 180 px touch icon. iOS Safari "Add to Home Screen" works. There is no service worker, so no offline mode and no push. The manifest has no 192 px or 512 px icon, so Android install prompts may not show. This does not matter on iPhone.
- **Hosted client.** `app.t3.codes` is T3's web client. It needs an HTTPS endpoint and connects straight to the server (`remote-access.md:174-182`). It has the same drift risk as path C and no extra benefit over path A.

I did not open our web UI at 390 px. Judge UX with one real look on the phone.

## 5. Upstream mobile commits since Oct 11 that matter for our own app

613 commits touch `apps/mobile`. 36 are `feat(mobile)` and 259 are `fix(mobile)`. Most need upstream's newer `client-runtime` and `contracts`. Group by value:

Take first (bug and safety fixes):

- `c0f9e36184` (#26318) pairing deep links can no longer target a saved environment. Security.
- `76d5ec7a22`, `a8edf13f99` pairing form fixes.
- `36aea583bb` Android trusts user CA certificates (matters for private HTTPS).
- `a42bdd4e51` thread opened while reconnecting no longer becomes a new draft.
- `1ecb1a0f93` crash on wrapped source links. `7510e5e43c` Android dialogs.
- `b76a110aa4` compact persisted thread snapshots. `1eb4071a49` terminal output without replay. `ba006f2dfa` bounded markdown cache.

Take if we want them (features):

- `5495cc4445`, `bed923986f`, `d07a07f33c`, `edb2b2f365` native pull request review, offline PRs, labels and checks.
- `91455de0f2`, `5848bc263b` Usage and Settings as workspace tabs. `92125d612d` iPad inspector.
- `7bafc40c17` inline audio, `5b70d81b0d` ZIP attachments, `3de3eee0d1` voice input refactor.

Skip or hold (need a newer server or add T3 services):

- Linked environments and peer links: `a6676f9a13` (#16698), `8b14660b27` (#17129), `5e9d56416f` (#17130), `4ab7084aa7`, `0affd28db2`, `c2fbf0a524`. They need `peerLinks.*` RPCs on the server.
- `612a8e59f0` dynamic workflows.
- `570d4b03ee` Axiom crash reports. Keep the token empty.
- Build tooling that assumes T3's shared cache: `0191d6c647`, `d9abfdd1cb`, `91f47a1a27`.

Server dependency: `abd9d9f970`, `e57c093cdd`, `3cc31ed27c` change the server too. If we take mobile commits that call them, we must also merge those server commits. This is the real cost of staying current.

## Recommendation

Do A, then C, in that order, on the same afternoon. Both need the same first step: make the Leonidas server reachable on the tailnet (HTTPS with Tailscale Serve if it works). Both cost $0 and need nothing built. Path A proves the network. Path C proves the native app.

Do not start E yet. It costs $99 per year plus days of work, and it adds a permanent upstream merge job for `apps/mobile`.

What flips the recommendation to E:

- Path C fails the 20 minute test (threads do not load, or settings fail to decode).
- T3 sets the protocol version to 3 and the App Store app refuses our server.
- Jake wants Leonidas features on the phone (task Inbox, Today, failover, Leonidas name). The official app cannot show them.

What flips it away from A and C: Jake wants no `T3 Code` icon on his phone. Then E is the only path.

Open checks I did not run:

- Whether our server is running with network access, and on which port.
- Whether Tailscale HTTPS certificates are enabled for the tailnet.
- The 390 px look of our web UI.
- Any real pairing test with the store app.

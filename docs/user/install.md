# Install Leonidas

Leonidas runs coding agents on your computer and lets you control them from its
desktop, web, or mobile app. Set up the machine where the agents will work first.

## Requirements

You need an installed, authenticated provider before starting a thread. You can
launch Leonidas and configure providers afterwards.

## Command line

The `t3` command-line tool ships inside the desktop app (see
[The `t3` command](#the-t3-command)). The upstream one-line installer at
t3.codes installs T3 Code, not Leonidas, so it is not listed here.

| Task                                             | Command                                                   |
| ------------------------------------------------ | --------------------------------------------------------- |
| Start the server and open the web app            | `t3`                                                      |
| Start the server without a browser               | `t3 serve`                                                |
| Keep it running in the background (macOS, Linux) | `t3 service install` ([details](./background-service.md)) |
| Move to the newest release                       | `t3 update`                                               |
| Remove it again                                  | `t3 uninstall`                                            |

Run `t3 help` or `t3 --help` for the full reference. To start in a new working
directory, use an explicit path such as `t3 ./my-project`. A bare directory name
is accepted only if it already exists.

If `t3` or `t3 start` reports an already running server, connect to that server
instead. Stop it before starting a replacement, or use a different `--base-dir`
for an independent server.

### Intel Macs

There is no `t3` executable for Intel Macs (the desktop app is available). To
run a server there, build it from source with Node.js 24 and `vp`
([Install vp](https://github.com/ItzJsimp/leonidas-app#install-vp)):

```bash
git clone https://github.com/ItzJsimp/leonidas-app
cd leonidas-code && vp i && vp run build:desktop
node apps/server/dist/bin.mjs
```

`t3 update` and the background service do not apply to a server run this way;
update it with `git pull` and a rebuild.

## Desktop app

Download the latest installer from [GitHub Releases](https://github.com/ItzJsimp/leonidas-app/releases).
The Windows build is unsigned, so SmartScreen warns once on first install.
Package-manager installs (winget, Homebrew, AUR) are not published for Leonidas.

Development releases use `0.MINOR.PATCH`: new features advance MINOR, and fixes
advance PATCH. Version `1.0.0` is reserved for the public launch. If you have a
legacy `1.0.x` installation, run the latest `0.x` installer once to switch to development
releases. Your projects and conversations stay in the same app data directory;
subsequent `0.x` updates use the normal updater.

From a repository checkout, `pwsh -File scripts/leonidas-update.ps1 -WaitForExit`
verifies the latest installer and installs it after you close the app normally.
It preserves your existing projects and conversations. Run it once on each machine;
the legacy updater cannot accept the lower development version number.

Open **Settings → General → About → Update history** to browse patch notes for
current and older versions. In the desktop app, enable **Install updates when
agents finish** to automatically restart after an update downloads and your
agents stop working. Otherwise, choose when to install each downloaded update.

The `.deb` updates itself like the other desktop builds. It asks for your
password to install each update. If your desktop has no password prompt, the
update fails. Download the new `.deb` and install it the same way.

### The `t3` command

The desktop app includes the `t3` command-line tool. To run it from any
terminal, open **Settings → General → About** and choose **Install** next to
**t3 command**. On macOS and Linux it adds a `t3` link to a folder on your
`PATH`; on Windows it adds the app's command folder to your `PATH`. Open a new
terminal afterwards. **Remove** takes it off again. If you already have `t3`
from npm, it stays as it is.

### Windows Subsystem for Linux

Choose a WSL distro in **Settings → Connections** to run agents and projects
there. Install the provider CLIs inside that distro. Leonidas installs its own
server runtime there automatically; the first launch after an app update can
take longer.

### Open a project from a terminal

With the desktop app already running on the same machine:

```bash
t3 app
```

This opens a new thread for the current directory, adding the project if needed.
Pass a path, such as `t3 app ../my-project`, to open another directory. It requires
the desktop app, so a standalone server or an SSH session is not enough. If the
command cannot reach the app, start or update the desktop app and try again.

## Mobile app

Leonidas does not publish its own mobile app yet. The upstream T3 Code mobile
app can connect to a server you run, using a pairing URL (see
[remote access](./remote-access.md)).

If the app crashes during launch, open Settings → Diagnostics on the next launch
that succeeds. It lists startup crashes from the last 7 days with the error and
component stack that store crash reports leave out. Copy the report and paste it
into a GitHub issue. Error messages can quote values from the app, so read it over
before sharing.

## Providers

Open **Settings → Providers** in the web or desktop app, select the environment,
and enable the provider you want. Installation, login, and configuration belong
to that environment's machine, even when you connect from a phone or another
computer.

| Provider    | Install and authenticate                                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex       | [Connect with ChatGPT](./providers-codex.md#connect-with-chatgpt), or install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`. |
| Claude      | Install [Claude Code](https://claude.com/product/claude-code), then run `claude auth login`.                                                              |
| Cursor      | [Sign in with Cursor](./cursor.md#sign-in) in **Settings → Providers → Cursor**, or set `CURSOR_API_KEY` (requires secrets). No CLI is required.          |
| Grok Build  | Install [Grok Build CLI](https://x.ai/cli), then run `grok login`.                                                                                        |
| OpenCode    | Install [OpenCode](https://opencode.ai), then run `opencode auth login`.                                                                                  |
| Antigravity | Install and sign in with Google from Leonidas's provider settings.                                                                                        |
| Pi          | Install [Pi](https://pi.dev), then run `pi` once to finish its login or API-key setup.                                                                    |
| Muse Code   | Install [Muse Code](https://dev.meta.ai/docs/muse-code) on the server, run `muse login`, then enable it in Settings → Providers.                          |

Provider CLIs must be on the server's `PATH`. If Leonidas cannot find one, set its
**Binary path** in provider settings, especially when using a version manager.
Codex connected through ChatGPT, Cursor via SDK, and Antigravity use managed runtimes without a `PATH` entry.

Leonidas warns when a provider version has known compatibility problems with your
release. Check **Settings → Providers** on that environment for the recommended
version or range. When its package manager supports installing a specific version,
you can install the recommendation there. Otherwise use the provider's installer
on the environment's machine. An unlisted version is unverified.

When a provider CLI is behind its latest release, its provider card shows the
available version. **Update now** runs the installer that owns the CLI
(Homebrew, or a global npm, pnpm, Yarn, Bun, Volta, or Vite+ install), or the
CLI's own update command when Leonidas cannot tell. Update a CLI installed with
mise through mise. Cursor and Antigravity update with Leonidas. Homebrew installs
compare against the version Homebrew offers, which can trail the npm release by
a few hours.

Add another provider instance for a separate account or configuration. Each
instance can have its own environment variables, such as API keys or a custom
base URL. Mark secret values as sensitive; after saving, Leonidas does not display
their original values.

For provider-specific setup and accounts, see [Codex](./providers-codex.md),
[Claude](./providers-claude.md), [Cursor](./cursor.md), [OpenCode](./providers-opencode.md),
[Antigravity](./providers-antigravity.md), [Pi](./providers-pi.md), and
[Muse Code](./providers-muse.md).

## Next steps

- [Working with threads](./thread-sidebar.md): start tasks and organize parallel work.
- [Permission modes](./permission-modes.md): choose when agents ask before acting.
- [Remote access](./remote-access.md): connect from another device.
- [Running in the background](./background-service.md): keep a Linux or macOS host available.
- [Updating Leonidas](./updating.md): update the app and connected servers.

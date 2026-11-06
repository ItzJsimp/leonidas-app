# Leonidas: machine setup (read on demand)

Moved out of [LEONIDAS.md](../LEONIDAS.md) so it is not loaded every turn. Read it when setting up a machine.

## New machine setup (teammates: do this once)

Paste this to your Claude in any folder:

> Clone https://github.com/ItzJsimp/leonidas-app into `projects/leonidas-app` inside my AIOS (if not already cloned), then run `pwsh -File scripts/leonidas-setup.ps1 -AiosClaudeMd "<path to my AIOS>/CLAUDE.md"` from the clone, then run `claude` once in the clone so I can approve the import dialog.

That sets rebase pulls, links your AIOS identity, installs the latest Leonidas (replacing any T3 Code install and shortcuts) and launches it. Right-click its taskbar icon and pick Pin to taskbar. After that: code changes arrive by the auto-pull at each Claude session start; app changes arrive as the in-app update toast after every push to `main`.

## Next action (existing AIOS installs)

The [next action skill](../.agents/skills/next-action/SKILL.md) ships in this repository. Setup and the Claude and Codex session-start hooks install it in the parent AIOS and existing projects, with backups for changed files. A fresh conversation discovers the new skill; an already-running agent can retain its old skill catalog.

After pulling `main`, Codex loads [its project hook](../.codex/hooks.json) on startup and resume, including when started in a project subdirectory. With a current Codex CLI, trust this project and review the new hook once using `/hooks`; Codex skips untrusted hooks until reviewed. After that, installation runs automatically. The Codex hook installs from the checked-out source; it does not pull changes. Older Codex versions without lifecycle hooks need an update or the manual installer below. See [Codex hook setup](https://learn.chatgpt.com/docs/hooks).

To install now, from your AIOS root run `git -C projects/leonidas-app pull --rebase --autostash origin main`, then `pwsh -NoProfile -File projects/leonidas-app/scripts/Install-NextAction.ps1 -AiosRoot .`. The installer prints the machine-local verification result. Say `next action, skip` in a fresh Leonidas conversation to get a recommendation without the energy interview.

App updates and AIOS updates are separate: downloading a desktop installer does not by itself update the task folders or skill files in an existing AIOS.

## AIOS task views (teammates: do this once)

The project's `tasks/` folder is a generated view: one symlink per task card whose `project:` is `leonidas-code`, pointing at your AIOS `tasks/` folder (the cards stay the only copy). The session-start hook already refreshes it for this project. To get the same for every project in your AIOS and to make new cards appear instantly, paste this to your Claude:

> In my AIOS root, copy `projects/leonidas-app/scripts/Sync-ProjectTaskViews.ps1` to `scripts/Sync-ProjectTaskViews.ps1`. Add a call to it at the end of `scripts/New-Task.ps1` right before the final "Created task" message: `if ($Project) { & (Join-Path $PSScriptRoot 'Sync-ProjectTaskViews.ps1') -RepoPath $RepoPath -Project $Project | Out-Null }` (use the repo-root variable that script already has). If `scripts/Build-TasksIndex.ps1` exists, call the script with `-RepoPath $RepoPath` at its end too. Add one line to my AIOS `AGENTS.md`: every `projects/<slug>/tasks/` is a generated symlink view of that project's cards, so cards are written only in the AIOS `tasks/`, never inside a project. Run `pwsh scripts/Sync-ProjectTaskViews.ps1`, then `-Check` and show me the output. It needs Windows Developer Mode on (Settings > System > For developers). Commit only those files.

## Load your own AIOS on top (each person, once per machine)

Select this repo folder in T3 Code. To also load your own AI operating system's identity in these sessions:

1. Create `CLAUDE.local.md` in the repo root containing `@<path to your AIOS>/CLAUDE.md` (forward slashes, a backslash before every space, for example `@D:/My\ AIOS/CLAUDE.md`). Optionally add a second line importing your AIOS's playbook for this project.
2. Make it local only: `mkdir -p .git/info` then add `CLAUDE.local.md` to `.git/info/exclude`.
3. Run `claude` once in this folder and answer Yes to the external imports dialog. Without that approval the imports silently do not load.
4. Check: ask an agent in a new session to quote a line that only your AIOS canon contains.
   Redo step 3 if the folder is moved or renamed. Never commit `CLAUDE.local.md`; it holds your own paths.

## Mac setup (Apple Silicon, no Apple developer account)

The Mac app is unsigned, so macOS blocks it the first time. Auto-update does not work on an unsigned Mac app: download each new version by hand.

1. Download https://github.com/ItzJsimp/leonidas-app/releases/latest/download/Leonidas-Setup-mac.dmg and drag Leonidas to Applications.
2. Open the app. When macOS blocks it, go to System Settings > Privacy & Security and click Open Anyway.
3. If macOS says the app "is damaged", run this once in Terminal, then open the app again: `xattr -dr com.apple.quarantine "/Applications/Leonidas.app"`
4. In the welcome wizard, sign in to Claude or Codex. The wizard installs them with the macOS command.
5. At the AIOS step, use the chat option. The "Paste this into PowerShell" command is for Windows only.
6. At the Voice step, add a free Groq key. Allow the microphone when macOS asks. The mic button in the composer then turns speech into text for your agent.
7. Optional, for AIOS scripts (`.ps1`): `brew install --cask powershell`.

Not on Mac: Leonidas Scribe (system-wide dictation hotkey), hardware watch and the local VM tool. They are Windows-only today.

# Words we use

Leonidas and Leonidas Scribe use one word for one thing. This list is the source for every label, message and tooltip. When you write text a user can see, use the word in the first column. Do not use the words in the last column.

Code names (`thread`, `providerInstance`, `worktree`, `turn`, `T3CODE_*`, `@t3tools/*`, `~/.t3`) stay as they are. Only the text a user sees changes.

## Leonidas

| Word                  | One meaning                                                                                                           | Do not use                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| chat                  | One conversation with an AI, with its messages and its changes.                                                       | thread, session, conversation                      |
| message               | One thing you send to the AI, or one thing the AI sends back.                                                         | prompt (in labels), input                          |
| reply                 | The work the AI does after one of your messages, until it stops.                                                      | turn, run, response cycle                          |
| AI service            | The company app that does the work, for example Claude or Codex.                                                      | provider, harness, driver, agent runtime           |
| AI account            | One sign-in to an AI service. You can have more than one per service.                                                 | provider instance, profile, credential             |
| model                 | The AI version that writes the reply, for example Opus or GPT.                                                        | engine, LLM                                        |
| project               | A folder on your computer that you work on with the AI.                                                               | workspace, repo (in labels), cwd                   |
| separate copy         | A second copy of the project folder, so the AI does not change your main files. Tooltip: "Git calls this a worktree." | worktree, sandbox, checkout                        |
| main folder           | The project folder itself, not a separate copy.                                                                       | checkout, current checkout, local checkout         |
| computer              | A machine that runs Leonidas: this one, or one you connect to.                                                        | environment, host, server, backend                 |
| remote access         | Use Leonidas on this computer from your phone or another computer. Tooltip: "Uses the T3 Connect service."            | T3 Connect, tunnel, relay, pairing, managed tunnel |
| remote access account | The sign-in for remote access. It is a T3 account, not a Leonidas account.                                            | T3 Account, Leonidas account                       |
| helper                | A second AI that does one part of the work for the chat you are in.                                                   | subagent, child task, delegate, worker             |
| teamwork              | Many helpers that work at the same time and report back to one chat.                                                  | orchestration, fan-out, swarm                      |
| tools                 | Extra abilities you add to the AI, for example a database or a browser. Tooltip: "These use MCP servers."             | MCP, MCP server, integrations (in labels)          |
| skill                 | A saved set of steps the AI can follow when you ask for it.                                                           | command (for skills), recipe                       |
| task                  | One piece of work on the task board, with a status.                                                                   | ticket, card, issue (for board items)              |
| waiting messages      | Messages you sent while the AI was busy. They go out in order when it stops.                                          | queue, queued prompts                              |
| send now              | Give the AI a new message while it works, without waiting for it to stop.                                             | steer, interrupt-and-send                          |
| stop                  | End the reply now.                                                                                                    | interrupt, cancel turn, abort                      |
| go back               | Return the project files to how they were at one point in the chat.                                                   | rewind, revert to checkpoint, restore checkpoint   |
| changes               | The lines the AI added, changed or removed in your files.                                                             | diff, patch, delta                                 |
| usage                 | How much of your AI account limit you used.                                                                           | quota, tokens (in labels), credits                 |
| permission            | What the AI can do without asking you first.                                                                          | runtime mode, approval policy, sandbox mode        |
| update                | A new version of Leonidas or Scribe.                                                                                  | release, build, patch (in labels)                  |
| AI                    | The AI that works in a chat, in short labels such as "AI behavior".                                                   | agent                                              |
| copied chat           | A new chat that starts from a copy of another chat. The first chat is the original chat.                              | fork, forked thread, branch (for chats)            |
| save point            | A saved state of the project files that you can go back to.                                                           | checkpoint, snapshot                               |
| chat memory           | How much of the chat the AI can still keep in mind.                                                                   | context window, context                            |
| shorten history       | Make the chat memory smaller so the AI can continue.                                                                  | compact, compaction                                |
| saved draft           | A message you put aside to send later.                                                                                | stash, stashed prompt                              |
| saved message         | A message, note or task that you keep to use again.                                                                   | prompt (for saved items), snippet                  |
| helper group          | Helpers that start together for one request.                                                                          | subagent batch                                     |
| task board            | The screen that shows all tasks by status.                                                                            | tasks page, kanban                                 |
| connection code       | The code you enter or scan to connect a device.                                                                       | pairing code, token                                |
| message box           | The box where you type a message to the AI.                                                                           | composer, prompt box, input                        |
| done                  | A chat or task that needs no more action. "Mark as done" sets it; "Bring back" undoes it.                             | settled, settle, wake, resolved                    |
| needs permission      | The AI waits for you to allow an action.                                                                              | pending approval, awaiting approval                |
| code service          | A website that stores your code, for example GitHub.                                                                  | source-control provider, host, forge               |
| text used             | How much text the AI read and wrote. Tooltip: "Counted in tokens." Parts: new text and reused text.                   | tokens, cache, input/output tokens                 |

Git words stay, because the AI and GitHub use them: **branch** (a named line of changes), **commit** (one saved set of changes with a note), **pull request** (a request to add a branch to the main code). Each one gets a tooltip the first time a screen shows it.

## Leonidas Scribe

| Word           | One meaning                                                        | Do not use                            |
| -------------- | ------------------------------------------------------------------ | ------------------------------------- |
| dictation      | Text that Scribe writes from your voice.                           | transcription (in labels), STT        |
| hotkey         | The key or keys that start and stop dictation.                     | keybind, shortcut chord               |
| clean up       | Scribe fixes the words, grammar and format of a dictation.         | polish, post-process, refine          |
| meeting        | A call that Scribe records and writes as text.                     | session, capture                      |
| notes          | The short summary Scribe writes after a meeting.                   | digest, minutes                       |
| word list      | Words that Scribe must spell your way.                             | dictionary, vocabulary, lexicon       |
| backup service | A second speech service that Scribe uses when the first one fails. | failover, fallback provider, tertiary |

## Rules for text a user sees

- Every button label starts with a verb: "Save", "Add AI account", "Open project".
- Every empty screen and every error says what to do next: "No chats yet. Type a message below to start one."
- Use "T3 Code" only to give credit to the upstream project (About and open source licenses).
- Write in ASD-STE100 short form: short active sentences, one idea each, simple tense.

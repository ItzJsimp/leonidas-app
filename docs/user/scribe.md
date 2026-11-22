# Scribe: dictate and rewrite with your voice and hotkeys

Scribe types what you say into any app. It also rewrites text you select. It runs in the background and starts with Leonidas. Open the **Scribe** page to change settings.

## Set up

1. Open **Scribe**, then **Settings**.
2. Paste your Groq key in **Groq key**. Groq gives speech and clean-up for free at low use.
3. Press the hold key, say a sentence, and let go. The text appears where your cursor is.

Scribe works with only a Groq key. A second speech service (Deepgram or Gemini) adds a backup. A service without a key is skipped.

## Dictate

| Action       | Default key                            | What happens                        |
| ------------ | -------------------------------------- | ----------------------------------- |
| Hold to talk | Ctrl + Shift + T                       | Records while you hold the key.     |
| Toggle       | Mouse button 5 or Ctrl + Shift + Space | Press once to start, again to stop. |
| Cancel       | Escape                                 | Throws away the recording.          |

- A recording under a quarter of a second is dropped.
- A recording stops at the longest time in **Settings** (10 minutes by default).
- A pill on screen shows when Scribe listens and when it works. You can turn the pill off in **Settings**.
- Scribe cleans the text: punctuation, capital letters, filler sounds. It does not change what you meant.
- Very short phrases (four words or fewer) skip clean-up and appear faster.

## If a speech service fails

Scribe tries the next service. If all fail, it saves your audio and shows an error. Open the take in **Transcripts** and use retry. The retried text goes to the clipboard, not into the app. Saved audio lasts 7 days.

## Words

Open **Dictionary** to add names and terms. Scribe spells them your way and gives them to the speech service as hints. A hint list lifts the right spelling of names a lot. Add a replacement when you want a short phrase to expand ("btw" becomes "by the way").

Scribe also suggests words it saw you fix. Accept or reject each one.

## Rewrite selected text

1. Select text in any app.
2. Press **Ctrl + Shift + A**.
3. Pick a preset with the mouse or the keys 1 to 9.
4. Scribe replaces the selection with the rewritten text. Press **Escape** to cancel while it works.

Built-in presets:

| Preset   | Use it to                                                  |
| -------- | ---------------------------------------------------------- |
| Clarity  | Make each sentence mean one thing. Same facts, same voice. |
| Shorter  | Cut filler. Keep your voice and every fact.                |
| Friendly | Write a warm message to a client or a friend.              |
| Prompt   | Turn a spoken idea into a clear prompt for an AI.          |
| Slack    | Turn a rambling thought into a short Slack message.        |
| Email    | Turn a rough note into a clear, polite email.              |

Open **Rewrite** to edit, add, remove or reset presets. The picker shows up to nine. If you saved your own list, it keeps your list. Use **Reset to defaults** to get the new presets. Rewrite needs the cloud, so it does not run in private mode. The result is saved in your history.

## Private mode

Private mode keeps audio on your computer. Scribe uses only the offline model, which downloads once (about 60 MB). Clean-up and rewrite turn off, because they send text to the cloud. Private takes are never saved for retry.

## What leaves your computer

| Data                 | Goes to                                    | When                                 |
| -------------------- | ------------------------------------------ | ------------------------------------ |
| Audio of a dictation | Your speech services, in the order you set | Each dictation, unless private mode. |
| Text of a dictation  | Your clean-up service                      | Each dictation over four words.      |
| Selected text        | Your clean-up service                      | Each rewrite.                        |

Your keys stay in the Windows Credential Manager. They are never in a file or a log. Dictations stay in `history.jsonl` on your computer. You can delete each one in **Transcripts**.

A free Google Gemini key may let Google use your content to improve its products. Use a paid Gemini key, or leave Gemini unset, if that matters to you.

## Fix common problems

- **Nothing is typed.** Check that the app in front accepts paste. Scribe pastes with the clipboard, then restores the old text. It does not restore an image or a file.
- **The pill never shows.** Check that **Show the recording overlay** is on in **Settings**.
- **Microphone error.** Open Windows **Settings**, **Privacy**, **Microphone**. Allow desktop apps.
- **"Select text first".** Select text before you press the rewrite key.

More detail for maintainers: [Scribe internals](../internals/scribe/README.md).

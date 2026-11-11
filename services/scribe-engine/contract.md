# Scribe engine contract (v1.7)

v1.7 (2026-11-08): each suggestion adds `example`, one sample from the newest dictation with the fix. See `GET /v1/dictionary/suggestions`. Additive: an older engine leaves it out.

v1.6 (2026-11-07, Meetings): meeting recording, transcripts, speakers, notes and Ask. See the Meetings section at the end. Additive: nothing older changes.
v1.6.1 (2026-11-10, Meetings): `GET /v1/meetings/sources` lists mics, speakers and apps that make sound. `POST /v1/meetings/start` takes `mic`, `output` and `apps`, so a meeting records chosen apps and not the whole speaker mix. Additive: an old start body still works.

v1.5 (2026-11-06, Batch 4 parity): history items add optional `stt` and `polish`, strings. `stt` is the speech provider and model that served the take, as `provider/model` (for example `groq/whisper-large-v3-turbo`, `deepgram/nova-3`, `local/ggml-base.en-q5_1`). `polish` is `provider/model`, `fast-path` or `none`. A missing field means unknown (older lines and rewrites). `POST /v1/retry` runs the newest saved failed dictation again (see Retry).

v1.4 (2026-10-19, lane L1 contract addition for Lane C): history items add optional `private`, a boolean. New engines write it on every take. `true` means private mode was on at recording start or transcription. A missing field means unknown. Memory jobs must skip both `true` and missing fields before reading transcript text.

`GET /v1/history/public` (v1.4) accepts the same paging parameters as history, but returns only items with `private: false`. Private and unknown items are filtered before their text is copied into the reply. Memory jobs use this endpoint so an older engine fails closed instead of returning private history.

v1.1 (2026-10-17, lane L1) is additive: v1 clients keep working and `apiVersion` stays `1`. New: `groqKey` and `privateMode` in status, the credentials commands, and `raw` and `engine` in the `transcript` event.

v1.2 (2026-10-18, lane L1) is additive: dictation history, dictionary, settings and devices. New: `GET /v1/history`, `DELETE /v1/history/{id}`, the `history` event, `GET` and `PUT /v1/dictionary`, `GET /v1/dictionary/suggestions`, `DELETE /v1/dictionary/suggestions/{wrong}`, `GET` and `PATCH /v1/settings`, and `GET /v1/devices`. The engine saves each transcript to `history.jsonl` next to its config file.

The engine is a Rust process. Leonidas supervises it and drives it over loopback HTTP. The contract is the only coupling ([ADR-0074](../../../../decisions/0074-leonidas-scribe-engine-moves-to-rust-and-python-leaves-the-product.md)). Any UI can drive the engine through it.

v1.3 (2026-10-18, lane L1) is additive too. New: `localModel` in status, and `engine: "local"` in the `transcript` event. The engine falls back to an on-device whisper.cpp model when the cloud cannot answer, and private mode uses only that model.

## Transport

- Bind `127.0.0.1` only, default port `8766`. Fail to start if the port is taken. The engine config (`%APPDATA%\Leonidas\scribe-engine\config.json`, field `port`) can change the port, for example to run next to Python Scribe.
- Reject any request with an `Origin` header or a `Host` other than `127.0.0.1:<port>` (403 `{"error":"forbidden"}`).
- All bodies are JSON (`Content-Type: application/json`). Responses carry `Cache-Control: no-store`.
- Every payload carries `"service":"leonidas-scribe"` and `"apiVersion":1`.
- Error body: `{"error":"<code>"}`. Codes: `forbidden`, `not_found`, `method_not_allowed`, `bad_request`, `status_unavailable`, `invalid_state`, `store_error` (v1.1: 500 when the OS credential store fails; no detail is returned).

## States

`ready`, `listening`, `processing`, `mic_error`. This is the same set as `projects/leonidas-scribe/status_api.py`.

## Commands

### `GET /v1/status`

Matches the old Python API. 503 `status_unavailable` if no sample is under 5 s old.

```json
{
  "service": "leonidas-scribe",
  "apiVersion": 1,
  "state": "ready",
  "sampledAt": "2026-10-15T01:00:00.000Z",
  "groqKey": true,
  "privateMode": false,
  "localModel": "absent"
}
```

- `groqKey` (v1.1): a Groq key is stored, or `GROQ_API_KEY` is set. The key itself is never returned.
- `privateMode` (v1.1): audio never leaves the device.
- `localModel` (v1.3, optional): the offline model, `absent`, `downloading` or `ready`. It downloads once (about 60 MB) the first time it is needed and is not in the installer.

### `POST /v1/start`

Start recording. Allowed in `ready` only; otherwise 409 `invalid_state`.

```json
{ "mode": "hold" }
```

Reply: `{"service":"leonidas-scribe","apiVersion":1,"state":"listening"}`. `mode` is `hold` or `toggle`.

### `POST /v1/stop`

Stop recording and start transcription. Allowed in `listening` only.

```json
{ "paste": true }
```

Reply: `{"service":"leonidas-scribe","apiVersion":1,"state":"processing"}`. When `paste` is true, the engine pastes the final text into the focused window.

### `POST /v1/retry` (v1.5)

Run the newest failed take again. Allowed in `ready` only. When every speech provider fails, the engine keeps the audio in `failed/` next to the history file (20 files, 7 days at most), and the `stt_error` message ends with "The audio is saved. Retry it in Scribe."

Reply: the state reply with `processing`. The result is a normal `history` event. The text goes to the clipboard, never into the focused window. The file is removed when the take succeeds. `404 nothing_to_retry` when no file is saved. `409 invalid_state` when not ready.

### `PUT /v1/credentials/groq` (v1.1)

Store the user's Groq key in the OS credential store (Windows Credential Manager, macOS Keychain).

```json
{ "key": "gsk_..." }
```

Reply: `204 No Content`. An empty or missing `key` is 400 `bad_request`. The engine never writes the key to a file or a log.

### `DELETE /v1/credentials/groq` (v1.1)

Remove the stored key. Reply: `204 No Content`, also when no key was stored.

### `GET /v1/history` (v1.2)

Query: `limit` (1 or more, default 50, at most 500), `before` (an item id; the page starts after it), `mode` (`hold` or `toggle`). Reply 200, newest first:

```json
{
  "items": [
    {
      "id": "d1760745603000",
      "at": "2026-10-18T00:00:03.000Z",
      "mode": "hold",
      "app": "",
      "rawText": "hello world",
      "cleanedText": "Hello world.",
      "words": 2,
      "metrics": { "transcribeMs": 700, "polishMs": 50, "totalMs": 760 },
      "pasted": true,
      "stt": "groq/whisper-large-v3-turbo",
      "polish": "groq/qwen/qwen3.8-27b"
    }
  ],
  "next": null
}
```

- `next` is the `before` value for the next page, or `null` on the last page. An unknown `before` gives an empty page.
- `app` is the exe file name of the foreground window when the recording started, for example `"Code.exe"`. It is `""` when the engine cannot read that window (an elevated one, for example).
- A bad `limit` gives 400 `bad_request`. An engine without a history store gives 404 `not_found`.

### `DELETE /v1/history/{id}` (v1.2)

Reply 200 `{"deleted":true}`, or 404 `not_found` for an unknown id, or 500 `store_error` when the file write fails.

### `GET` and `PUT /v1/dictionary` (v1.2)

```json
{ "replacements": [{ "wrong": "btw", "correct": "by the way" }], "vocabulary": ["Gersi"] }
```

- `PUT` takes the same shape and replies with the saved shape. It replaces both lists and keeps any other top-level key in `dictionary.json` (Python Scribe data).
- 400 `bad_request`: a missing or unknown field, an empty `wrong`, or more than 800 vocabulary items. The file is not written. 500 `store_error` when the write fails.
- A save applies to the next dictation. The body limit is 64 KB.
- A save also stamps each changed word under a top-level `sync` key in `dictionary.json` (change time, deletion marker). Word sync needs it; an older engine ignores it.
- Word sync: while `features.wordSyncDir` holds a folder (set with `PATCH /v1/settings`), the engine merges the other computers' files in that folder every 30 s and writes its own `<computer name>.json` there. It reads the setting each time, so a change needs no restart. It never writes built-in words.

### `GET /v1/dictionary/suggestions` (v1.2)

```json
{
  "items": [
    {
      "wrong": "jersey",
      "correct": "Gersi",
      "count": 3,
      "example": {
        "heard": {
          "before": "I talked to ",
          "changed": "jersey",
          "after": " today about the new demo"
        },
        "wrote": {
          "before": "I talked to ",
          "changed": "Gersi",
          "after": " today about the new demo"
        }
      }
    }
  ]
}
```

- Mined from the newest 500 history items: a run of 1 to 3 raw words that polish replaced with the same 1 to 3 words in 2 or more dictations. Case and punctuation changes do not count.
- v1.5: the correct side must hold a term (an inner capital, a letter next to a digit, or a capital that a sentence start does not explain). Style edits such as "gonna" to "going to" are never suggested.
- `wrong` is lower case. Runs already in the dictionary or rejected are left out. At most 50 items, most often first.
- v1.7: `example` shows the fix in the newest dictation that holds it. `heard` is the raw text and `wrote` is the cleaned text, each cut to the run plus up to 6 words on each side. `before + changed + after` is the cut text, and `changed` is the run to mark. A side that was cut short carries an ellipsis. Punctuation at the edge of a word is dropped. A client must accept a missing `example` (an older engine).
- Accept a suggestion with `PUT /v1/dictionary`.

### `DELETE /v1/dictionary/suggestions/{wrong}` (v1.2, engine addition)

`{wrong}` is URL-encoded (`leo%20nightness`). The run never shows again. Reply 200 `{"rejected":true}`, 400 `bad_request` for a bad escape, 500 `store_error` when the write fails. Rejects live in `suggestions-rejected.json` next to the config file.

### `GET /v1/settings` (v1.2)

```json
{
  "sections": {
    "hotkeys": { "hold": ["Ctrl + Shift + T"], "toggle": ["Mouse5"], "cancel": ["Escape"] },
    "audio": { "device": null, "maxRecordSeconds": 600, "minRecordMs": 250 },
    "transcription": {
      "privateMode": false,
      "polishEnabled": true,
      "polishInstructions": null,
      "whisperModel": "whisper-large-v3-turbo",
      "whisperModelBackup": "whisper-large-v3",
      "polishModel": "qwen/qwen3.8-27b",
      "backupPolishModel": "openai/gpt-oss-20b",
      "groqKey": { "set": true }
    },
    "presets": {},
    "hud": { "enabled": true },
    "features": {},
    "goals": {}
  }
}
```

- A key never appears: `groqKey` is `{"set":true}` or `{"set":false}`. Set it with `PUT /v1/credentials/groq`.
- `audio.device` is a `name` from `GET /v1/devices`; `null` is the system default.
- `presets`, `features` and `goals` belong to the Leonidas UI. The engine stores them as sent and never reads them.

### `PATCH /v1/settings` (v1.2)

Body `{"section":"audio","values":{"device":"USB Mic"}}`. The values merge into that one section; the engine saves `config.json` atomically. Reply 200:

```json
{
  "section": "audio",
  "values": { "device": "USB Mic", "maxRecordSeconds": 600, "minRecordMs": 250 },
  "restartRequired": false
}
```

- Live at once: `hotkeys`, `audio`, `privateMode`, `polishEnabled`, `polishInstructions`, `presets`, `features`, `goals`.
- `restartRequired: true` after a change to a model or to `hud`: the saved value applies after the supervisor restarts the engine.
- 400 `bad_request`: an unknown section, an unknown key or a wrong type in a typed section, `groqKey` in the values, or `values` that is not an object. Nothing is saved. 500 `store_error` when the write fails.

### `GET /v1/devices` (v1.2)

```json
{
  "inputs": [
    {
      "id": "Microphone (USB PnP Audio Device)",
      "name": "Microphone (USB PnP Audio Device)",
      "default": true
    }
  ]
}
```

`id` equals `name` (the audio library has no stable id). 500 `mic_error` when the device scan fails.

## Events

### `GET /v1/events`

Server-sent events (`text/event-stream`). One JSON object per `data:` line. Each event also carries `service` and `apiVersion` (left out of the examples below). A `: ping` comment arrives every 15 s. Types:

```json
{"type":"state","state":"listening","at":"2026-10-15T01:00:00.000Z"}
{"type":"partial","text":"hello wor","at":"2026-10-15T01:00:01.000Z"}
{"type":"transcript","text":"Hello world.","raw":"hello world","durationMs":1840,"pasted":true,"engine":"groq","at":"2026-10-15T01:00:03.000Z"}
{"type":"error","code":"mic_error","message":"No input device","at":"2026-10-15T01:00:00.000Z"}
```

- `transcript.text` is the polished text that was pasted. `raw` (v1.1) is the speech-to-text output before polish. `engine` (v1.1) is `groq` or `local`.
- Error codes: `mic_error` (no device or capture failed), `stt_error` (speech-to-text failed; the state returns to `ready`).
- `history` (v1.2): `{"type":"history","item":{...}}` follows the `transcript` event after the save, with the item shape of `GET /v1/history`. When the save fails, an `error` event with code `store_error` comes instead.
- A v1 reader ignores the new fields; a v1.1 reader treats a missing `raw` as `""` and a missing `engine` as `groq`.

## Budgets

Hotkey to recording under 50 ms. Idle RAM under 30 MB. CI fails the build on a miss.

# v1.4 (additive)

The `hotkeys` settings section includes `rewrite` bindings. History items can have
`mode: "rewrite"` and an optional `preset` name. The engine reads
`presets.rewrite` as an array of `{name, instruction}` objects.

# v1.6 Meetings (additive)

Meetings record the mic and the system audio (WASAPI loopback) as two tracks, transcribe them live on the Groq free tier, split the other speakers, and write notes from a template. Nothing runs until a meeting starts. Everything stays in `<config dir>/meetings/<id>/`.

Meetings errors add a plain `message` for the user: `{"error":"<code>","message":"..."}`.

## Storage

- Main root: `<config dir>/meetings/`. Import root: `<config dir>/meetings/python-import/` (the copied Python Scribe meetings), read only. A main folder wins over an import folder with the same id.
- An edit to an imported meeting (rename, Keep audio, transcribe, notes) first copies its JSON files to the main root. Import files never change. Audio is read where it is.
- Folder files, in the Python schema: `manifest.json`, `transcript.json` (segments `{speaker_key, track, t0, t1, text}`), `note.json` (`title`, `summary`, `decisions[{t,text}]`, `action_items[{owner,task,t}]`, `open_questions`), `chunks.jsonl` (one line per transcribed chunk), `me/seg-NNNNN.flac` and `them/seg-NNNNN.flac` (16 kHz mono, about 25 s), `them-voice.json` (voice features), `speaking.jsonl` (Discord events).
- Audio in the main root is deleted 30 days after the meeting ends unless `pinned` (Keep audio). Transcripts and notes stay. Import audio is never deleted.
- A meeting left in `recording` by a crash is rebuilt from `chunks.jsonl` on the next list.

## Commands

| Route                                                      | Body                                                          | Reply                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /v1/meetings`                                         |                                                               | `{"items":[summary]}` newest first                                                                                                                     |
| `GET /v1/meetings/{id}`                                    |                                                               | summary plus `manifest`, `transcript`, `note`, `folder`                                                                                                |
| `PATCH /v1/meetings/{id}`                                  | `{"title"?, "pinned"?, "speakers"?: {"old":"new"}}`           | the meeting                                                                                                                                            |
| `DELETE /v1/meetings/{id}`                                 |                                                               | 204. An imported meeting gets a hidden tombstone. 409 `recording` while it records                                                                     |
| `POST /v1/meetings/start`                                  | `{"title"?, "app"?, "template"?, "mic"?, "output"?, "apps"?}` | `{"id"}`. 409 `already_recording`, 409 `mic_error`. See "Audio sources" below                                                                          |
| `GET /v1/meetings/sources`                                 |                                                               | `{"mics":[{"id","name","default"}],"outputs":[...],"apps":[{"name","pid","playing"}],"perApp"}`. `perApp` is true on Windows 11 (build 20348 or later) |
| `POST /v1/meetings/stop`                                   |                                                               | `{"id"}`. 409 `not_recording`                                                                                                                          |
| `GET /v1/meetings/live`                                    |                                                               | `{"recording","phase":"recording"\|"finishing"\|"done"\|null,"id","elapsedMs","levels":{"me","them"},"segments","pending","failed","notices"}`         |
| `POST /v1/meetings/{id}/ask`, `POST /v1/meetings/live/ask` | `{"question"}`                                                | `{"answer"}`. 502 `provider_error`                                                                                                                     |
| `POST /v1/meetings/{id}/summary`                           | `{"template"?}`                                               | 202 `{"notesState":"working"}`                                                                                                                         |
| `POST /v1/meetings/{id}/transcribe`                        |                                                               | 202 `{"state":"transcribing"}`. 409 `no_audio`                                                                                                         |
| `GET /v1/meetings/templates`                               |                                                               | `{"items":[{"id","name"}]}`: `default`, `client-call`, `one-on-one`, `brainstorm`                                                                      |
| `GET /v1/meetings/detect`                                  |                                                               | `{"app":"Discord"\|null,"apps":[...]}`: call apps that use the mic now                                                                                 |
| `GET /v1/meetings/discord`                                 |                                                               | `{"configured","connected","clientId"?,"user"?}`. Never a secret or token                                                                              |
| `PUT /v1/meetings/discord`                                 | `{"clientId","clientSecret"?}`                                | the Discord status. 400 `bad_client_id`                                                                                                                |
| `DELETE /v1/meetings/discord`                              |                                                               | 204                                                                                                                                                    |
| `POST /v1/meetings/discord/connect`                        |                                                               | the Discord status after the user clicks Authorize in Discord (up to 180 s). 409 `discord_error`                                                       |

A summary row: `id`, `title` (note title, else manifest title), `started`, `ended`, `durationMs`, `state` (`recording`, `processing`, `transcribing`, `done`, `failed`), `app`, `people`, `pinned`, `imported`, `hasTranscript`, `hasAudio`, `audioDeletesAt`, `notesState` (`working`, `done`, `failed`), `notesError`, `transcribeError`, `template`.

Ask and Discord connect run on their own thread, so they never hold the HTTP thread. Notes and transcribe run in the background; poll the meeting.

## Speakers

The mic track is `Me`. System-audio segments get Discord names when Discord is connected (speaking events, most overlap wins), else a local voice split (`Speaker 1`, `Speaker 2`; spectral shape plus pitch, 1 s windows). One voice stays `Them`. Names can be changed with `PATCH`.

## Providers

Speech: Groq Whisper (`whisperModel`, then `whisperModelBackup` on a rate limit). Notes and Ask: Groq `openai/gpt-oss-120b`, then `openai/gpt-oss-20b`. A long transcript is condensed in parts first (free tier: about 8k tokens a minute). All free tier; no new account.

## Indicator

### Audio sources

- `mic`: a mic id from `GET /v1/meetings/sources`. Missing or empty means the system default. A mic that is no longer connected fails the start with 409 `mic_error` ("The chosen microphone is not connected").
- `apps`: app names from `GET /v1/meetings/sources` (for example `["Discord"]`). `app` is the old single-app field and counts as one entry. Windows captures each app's whole process tree (WASAPI process loopback), so other apps stay out of the file. Several apps are summed into the `them` track.
- Empty `apps`: all computer audio (loopback). `output` picks which speaker is recorded; missing means the system default speaker.
- An app that is not running, or Windows before 11, never falls back to all computer audio. The mic still records and `notices` says "Call audio is not recorded: ...".
- Discord speaker names start when `apps` holds `Discord`.
- The manifest `source` becomes `{"kind":"device"|"app","app":<first app>,"apps":[...]}`.

While a meeting records, the HUD pill shows a red dot and "Recording meeting", also with the Leonidas window closed. The app shows its own indicator from `GET /v1/meetings/live`.

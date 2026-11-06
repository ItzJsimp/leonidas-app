# Writing updates people understand

Write for someone using Leonidas, not someone building it. After ten seconds, they should know what changed and why they care. Explain the visible result before any detail. Use the exact button or screen name when it helps someone find the change.

## Two jobs, one standard

**The agent making the change** writes a final `Release-Note:` trailer for each verified user-visible outcome. Use `Release-Detail:` for smaller changes. Internal maintenance gets no user-facing trailer. These trailers feed the update notice and generated patch notes.

**The agent preparing the release** reviews all changes since the last published release and writes one coherent story for a meaningful feature update. Use `release-posts/<slug>.md`, and put `Release-Post: release-posts/<slug>.md` on the commit that includes it. The latest story trailer in the release range wins: coordinate rather than adding a competing story to every commit. A small fix-only update can use curated bullets alone.

## The story

- **Title:** a short, concrete benefit, such as "Find your next task faster". The app supplies version and date. Avoid internal project names, hype, and version numbers in the title.
- **Introduction:** one or two short sentences with the most useful change. Say who it helps or when it helps, if that adds clarity.
- **Feature sections:** usually one to three. Name the user activity, explain what now happens, then say where to find it. Two short paragraphs are enough. Do not give every minor fix a section.
- **Pictures:** show real, verified behavior. Place a sanitized screenshot beside the explanation it supports, with descriptive alt text. Use a caption only if it explains something the picture does not. Skip images for fixes that cannot usefully be shown.
- **Small changes:** leave them to generated New, Fixes, Improvements and Details sections. Never hand-copy the whole bullet list into the article.

Copy [the template](../assets/release-story-template.md), replace the placeholders, and remove unused sections. It is a starting point, not a requirement to pad short releases.

## Plain-language bullets

Use Added, Improved, Fixed, Changed or Removed. Aim for 8 to 18 words, one change each. Name the thing users see and the benefit or symptom. Keep the strongest five as highlights; use details for the rest. Product names and visible controls are fine. Explain unfamiliar terms or replace them. Never append "walk me through it", "restart and try", or other actions.

| Too technical                                                 | Clear to a user                                                               |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Turn ledger reports cache writes separately from fresh input. | Improved the usage breakdown so you can see what each reply costs.            |
| Context-audit reports instruction chain and skill token cost. | Added a breakdown showing how much space instructions take in a conversation. |
| Fixed RPC authorization for task mutations.                   | Fixed task changes failing when you use Leonidas from another device.         |
| Added release feed and version library.                       | Added pictures and clearer explanations to help you catch up on updates.      |
| Fixed pending update restart coordination.                    | Fixed updates restarting the app before your running agents finished.         |

These are wording examples, not claims to reuse without checking the actual change. Keep details that affect a user's decision, such as a limit or required sign-in. Drop implementation causes, file paths, acronyms, and development history. Required user action belongs in the explanation, never in a button attached to each note.

## Review before committing

Read the notes as someone who has never seen the code. Can they answer "What changed?", "Why does it help me?", and, when relevant, "Where do I find it?" Replace any sentence that needs a developer to translate it. Check each claim against the verified behavior and remove unsupported promises.

Preview the story through the real dev reader when browser testing is authorized. Check the update notice's first five highlights, the full article, pictures, and a narrow screen. If browser approval is missing, finish the copy and local generation checks first, then request only that approval. Use the existing release tests to verify generation. Publishing still needs authorization; this writing standard does not grant it.

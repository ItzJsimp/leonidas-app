---
name: grilling
description: "Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases."
category: planning
scope: structural
source: "https://github.com/mattpocock/skills (skills/productivity/grilling, MIT, adapted for the AIOS)"
distribution: core
license: MIT
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round, give your recommended answer for each question, then wait for the user's answers before the next round.

## Asking a round

Ask every round with your structured question tool (Claude: `AskUserQuestion`; Codex: `request_user_input`; other engines: their user-input tool). The tool shows the user a popup of selectable options and pauses the turn until they answer. One frontier question is one tool question:

- **Header:** a title of a few words. **Question:** the question and its context, in plain text.
- **Options:** 2 to 4, only as many genuine paths as exist. Each one is a path a strong engineer would defend under real conditions: no strawmen, no "do nothing", no near-duplicates. The label is a short title (5 words at most). The description is one sentence of at most 20 words: what happens, then `Wins when: <condition>.` Detail goes in your reply, not on the card.
- **Recommendation:** your recommended answer is the first option, its label ends with ` (Recommended)`, and its description puts `Why: <deciding factor>. Flips if: <condition>.` in place of `Wins when`. It also stays at most 20 words.
- **Overflow:** the tool takes at most 4 questions per call. When the frontier holds more, ask the 4 that unblock the most branches, then the rest in a second call of the same round.

When no structured question tool exists, write the round in chat instead: number each question, list its lettered options, and end it with `➡️ <your recommended answer>`. Word each question so "yes" accepts your recommended answer.

## Between rounds

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

**Capture file.** Before the first round, create `logs/grill-sessions/{YYYY-MM-DD}-{topic-slug}.md` (create the folder if it is missing; get the date from `date +%F`) with Topic, Date, Goal and the facts you found. After each round, append every question, the user's verbatim answer and the settled decision, newest round last. The file keeps the interview safe through context compaction, and the nightly harvest (`scripts/harvest-grill-memory.py`) reads it.

## Done

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Append a synthesis to the capture file and show it in chat: the settled design, the accepted tradeoffs, and the next action. Do not act on it until the user confirms you have reached a shared understanding.

Credit: adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). See [LICENSE](LICENSE).

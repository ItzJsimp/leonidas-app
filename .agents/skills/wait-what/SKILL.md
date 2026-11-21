---
name: wait-what
description: "Stop. That last message did not land: re-pitch it in plain words with the missing context. Use when the user says wait, what, or signals confusion."
disable-model-invocation: true
metadata:
  scope: structural
  category: research
  reach: core
  distribution: portable
  sources: ["mattpocock/wait-what@abeeaf9"]
license: MIT
---

# Wait What

Wait, I don't understand where you've got to here. Re-pitch that: give me a little bit of context, talk in [ASD-STE100 Simplified Technical English](../asd-ste100/SKILL.md), and use the ubiquitous language from the repo's glossary (`CONTEXT.md` or `GLOSSARY.md`; follow `GLOSSARY-MAP.md` to the right one if the repo has more than one).

Use it when output loses the reader: internal jargon, stacked acronyms, or a conclusion with no visible premise.

## Re-pitch

1. **Say where it paused.** Open with one line that names the gap.
2. **Premise first.** Say why the problem exists before you say how the solution works.
3. **Plain words.** Write at a 6th to 8th grade reading level. Translate each technical term on its first use. Use the glossary words.
4. **One concrete example or analogy.** A real-world case, or a 2-line input and output.
5. **One check-in question.** Ask whether the premise is clear before you go on.

## Shape

At most 3 short paragraphs: **The Core Idea** (1 to 2 sentences), **Why This Matters** (1 paragraph with the premise), **Concrete Example** (a small snippet or an analogy).

## Avoid

- Telegram brevity. Chopped sentences fail: shortness without clarity is not a re-pitch.
- The same paragraphs with louder formatting.
- New jargon to explain old jargon.

## Done when

- The re-pitch names the gap, gives the premise, one example and one check-in question, in 3 short paragraphs or fewer.

Credit: adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). See [LICENSE](LICENSE).

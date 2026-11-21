# Common rationalizations and red flags

Moved whole from `SKILL.md` on 2026-11-20. Nothing is cut.

## Common Rationalizations

| Rationalization                                      | Reality                                                                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| "It's working, no need to touch it"                  | Working code that's hard to read will be hard to fix when it breaks. Simplifying now saves time on every future change.                              |
| "Fewer lines is always simpler"                      | A 1-line nested ternary is not simpler than a 5-line if/else. Simplicity is about comprehension speed, not line count.                               |
| "I'll just quickly simplify this unrelated code too" | Unscoped simplification creates noisy diffs and risks regressions in code you didn't intend to change. Stay focused.                                 |
| "The types make it self-documenting"                 | Types document structure, not intent. A well-named function explains _why_ better than a type signature explains _what_.                             |
| "This abstraction might be useful later"             | Don't preserve speculative abstractions. If it's not used now, it's complexity without value. Remove it and re-add when needed.                      |
| "The original author must have had a reason"         | Maybe. Check git blame: apply Chesterton's Fence. But accumulated complexity often has no reason; it's just the residue of iteration under pressure. |
| "I'll refactor while adding this feature"            | Separate refactoring from feature work. Mixed changes are harder to review, revert, and understand in history.                                       |

## Red Flags

- Simplification that requires modifying tests to pass (you likely changed behavior)
- "Simplified" code that is longer and harder to follow than the original
- Renaming things to match your preferences rather than project conventions
- Removing error handling because "it makes the code cleaner"
- Simplifying code you don't fully understand
- Batching many simplifications into one large, hard-to-review commit
- Refactoring code outside the scope of the current task without being asked

# AIOS layer

Use this file in an AIOS. It holds the steps from the old `skill-creator` that depend on the AIOS scripts and standards.

The rules are in `standards/skill-standard.md`. If this file and the standard disagree, the standard wins.

## Steps that use AIOS scripts

- **Triage:** check `.agents/skills/skills-index.md` for an existing skill. Mark `scope: structural` when the skill is tracked in `scripts/sync/shared-manifest.psd1` for the peer AIOS. Mark `scope: personal` when it holds private data or operator-specific hardware bindings. Run the distribution test below and set `metadata.distribution` in the same change that creates the skill.
- **Reach and distribution:** decide the reach (`core`, `aios`, `project`) and the distribution (`portable`, `template`, `private`) as the skill standard defines them. Propose both for every new skill.
- **Scaffold:** `pwsh -File scripts/New-Skill.ps1 -Name "my-skill" -Description "..." -Scope "structural" -Category "<id from .agents/skills/_categories.json>"`. Or create the folder by hand.
- **Check:** run these four, in order.
  1. `pwsh -File scripts/Sync-AgentSkills.ps1` links the skill into `.claude/skills/`.
  2. `pwsh -File scripts/Audit-Substrate.ps1` checks frontmatter, U+2014 em dashes and links.
  3. `pwsh -File scripts/Detect-Drift.ps1` checks the shared manifest.
  4. `pwsh -File scripts/Build-Index.ps1` rebuilds the indexes when a skill was added.
- **Accept a learned skill:** after the user accepts, write the skill, run `scripts/Sync-AgentSkills.ps1`, `scripts/Audit-Substrate.ps1` and `scripts/Build-Index.ps1`, then commit.

## Governance checklist

Every skill in an AIOS must meet these rules:

- [ ] **No em dash (ADR-0012):** zero U+2014 characters. Use colons, commas, hyphens or parentheses.
- [ ] **Quoted YAML (ADR-0013):** the string fields `name` and `description` are double-quoted.
- [ ] **Tags:** `metadata:` holds scope, category, reach and distribution (skill standard, section 1). Legacy top-level keys pass the lint until the cutover migration.
- [ ] **Core skills:** distribution `portable`, no `## Fill-ins`, trigger test passed. Start is auto, except a main-flow step, which may be manual (ADR-0102).
- [ ] **No navigation footers (ADR-0013):** no Quick Navigation or trailing index footer.
- [ ] **Repo-relative links (Rule 7):** every file reference in repository markdown is a clickable relative link.
- [ ] **Listing budget:** keep descriptions tight, so Claude Code does not cut the portfolio listing.

## Distribution triage

`metadata.distribution` decides what ships when the user builds or hands over an AIOS (a hand-over bundle, the universal template, future installs). It is separate from `scope`: `scope` says whether the pattern is reusable, and `distribution` says whether this skill is packaged for other people.

| Value                      | Meaning                                                                                                        | Ships as                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `portable` (legacy `core`) | User-agnostic. Works for anyone with zero edits: no owner name, personal path, hardware, accounts or business. | Real copy, always                                                   |
| `template`                 | Generic procedure, but a few facts are owner-specific (name, machine, folders, accounts).                      | Copy with `{{PLACEHOLDER}}` blanks that the recipient's agent fills |
| `private`                  | Owner-only (own business, bridge, brand assets, workflows).                                                    | Never                                                               |
| absent                     | Not triaged yet.                                                                                               | Not shipped until triaged                                           |

**Triage test** (run it on every new or refactored skill):

1. Remove the owner's name, paths, machines and accounts. Does the skill still work for a stranger? Propose `portable`.
2. Does it work after a few blanks? Propose `template`. List each blank in a `## Fill-ins` section at the bottom of `SKILL.md`: the placeholder, its meaning, and how to get it (read memory, detect with a command, or interview the user once).
3. Is it tied to the owner's own business or setup? Propose `private`.

**Placeholders:** `{{UPPER_SNAKE}}`. Reuse names already in `scripts/Export-UniversalAIOS.py` (`{{OPERATOR_NAME}}`, `{{AIOS_NAME}}`, `{{MACHINE_NAME}}`, `{{CPU_MODEL}}`, `{{USER_HOME}}`, `{{REPO_PATH}}`) before you invent new ones. The recipient's agent fills the blanks from what it knows about the user, or interviews the user once and saves the answers to memory.

**Ask, do not wait:** the owner never has to say which skills to replicate. Tag the proposed value in the same change, then tell the user in one closing line (`distribution: portable, nothing personal in it`). Ask first only when the case is borderline: a generic method with heavy personal data, or a `private` call on something that looks reusable. Never leave a new skill untagged. Never promote `private` to `portable` without the user's yes.

**Keeping `portable` clean:** a portable skill calls the owner "the user", never by name, and holds no absolute personal path. Run the test again when a skill picks up owner-specific content.

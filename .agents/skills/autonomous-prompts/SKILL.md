---
name: "autonomous-prompts"
description: "Generate ten paste-ready prompts for independent work across projects, composed and graded with prompt-composer, with active-work overlap checks, verified skills, and two model picks plus an effort level per prompt."
category: "flow"
scope: structural
distribution: core
---

# Autonomous Prompts

Find the ten best tasks an agent can finish while the user is unavailable. Produce prompts only: generating a list does not authorize starting tasks, spawning agents or opening threads. Existing task cards are evidence, not the boundary of the search.

## 1. Establish scope and activity coverage

Read workspace instructions, trust boundaries and project indexes. Discover registered projects through available project tools and local registries; include relevant work outside the current repo. Honor requested scope and cross-repo privacy rules. Inspect project briefs, current goals, recent changes, checks, incidents and unfinished work. Use graph discovery for structural code questions when required.

Discover tools by their available names and schemas. In Leonidas, use project listing, thread listing with subagents included, and focused thread reads. Page through all results for each project; the current project's first page is insufficient. Inspect running, preparing, queued, starting and waiting work, plus recent unsettled idle/interrupted threads with unfinished intent. A waiting parent with live children is active. Inspect local task presence, worktrees, branches and dirty paths as supporting evidence. Never infer inactivity from a title, task status or quiet timestamp alone.

For each project record: root, sources checked, timestamp, active goals, task/thread identifiers, write paths or modules, shared contracts and uncertain ownership. Read only enough thread context to establish scope; keep private details out of other projects. Read-only discovery needs no worker delegation.

If a tool fails or a project is inaccessible, name the gap. Fall back to local evidence, but exclude affected candidates whose ownership cannot be established. Never claim global coverage from a local-only scan.

## 2. Build and screen candidates

Build two candidate pools independently:

- **Existing work:** useful unfinished tasks supported by cards or prior plans.
- **Fresh opportunities:** broadly useful prompts inferred from project goals, actual workflows, code, documentation and available tools. Examples include a recovery drill, a realistic evaluation set, a workflow improvement, an onboarding check, a focused research synthesis or a missing reusable capability. A fresh opportunity needs neither a task card nor a known defect.

Inspect both pools before ranking. For each fresh opportunity, state why it matters in this project, its bounded deliverable and a checkable finish. Distinguish an observed problem from a proposed improvement; do not invent defects to justify useful general work. Prefer project-specific value over generic busywork. An audit should lead to safe repairs or a useful finished artifact.

Reject a candidate when it:

- Conflicts with active or uncertain work in objective, files, modules, shared schema, generated output, migration, service or release path. Different filenames alone do not establish independence.
- Depends on another selected prompt, unresolved user taste, credentials, spending, external messages, destructive actions or approval before useful completion.
- Repeats completed work, has no checkable finish, or requires unavailable tools to produce its promised result.

A bounded draft or diagnostic artifact qualifies only when it delivers value without pretending the gated action occurred. Approval gates still apply. Choose safe reversible details from evidence and state assumptions; missing user replies are never approval.

Compare every pair of surviving candidates for overlap. Narrow scopes or replace conflicts. Shared read-only references are fine; shared writes and integration dependencies need exclusion or explicit disjoint ownership. Prefer independent outcomes across projects; do not force project quotas.

## 3. Rank the best ten

Score each survivor from 0 to 3 on user impact, evidence strength, unattended completion, verification strength and lasting value. Rank by total; break ties by lower user attention and lower execution cost. Exclude active-work overlap before scoring, rather than treating it as a penalty.

Prepare at least fifteen candidates across both pools when the evidence supports them. Aim for a balanced mix of about five existing tasks and five fresh opportunities, then select ten. This is a diversity target, not a quota: favor higher-value qualified work and explain a one-sided result. Never stop searching after finding ten existing cards. User-requested source preferences override the default mix. If fewer than ten pass the safety and independence checks, return the verified subset with a specific shortfall explanation. Never pad with guesses or claim unknown work is free.

## 4. Verify skills and compose each prompt

Read `.agents/skills/prompt-composer/SKILL.md` in full before you write any prompt. It governs how every prompt is built. Use the contract in `references/prompt-contract.md` only when that file is missing, and say so in the reply. Loading the composer is not optional, and a long run is not a reason to skip it.

Inspect the target project's actual skill catalog and read the selected skill instructions. Choose one primary skill plus only required supporting skills. Verify paths, availability, triggers, approval gates and compatibility with unattended work. Do not invent slash commands or assume a skill installed here exists in another project.

An interactive skill that requires unanswered choices is unsuitable as the primary workflow. Replace the candidate or use an appropriate bounded execution skill; never instruct agents to bypass its gates. Include stack and design skills when their triggers apply, and the project's performance and verification skills for code changes.

Run each prompt through the composer pipeline:

1. **Engine (Phase 0):** infer the target engine from the request or the launch provider. Use the matching scaffolding profile. When the engine is unknown, use the Universal Safe Default.
2. **Skills (Phase 1):** use Autonomous Agent Mode. Add a "Required Skill" directive with the verified skill paths inside the prompt body.
3. **Audit (Phase 2):** remove no-op lines. State required behavior in positive terms. Keep negative rules only for hard boundaries: writes outside scope, push, delete, spend, secrets. Make every done check binary and observable. Point to evidence by path instead of pasting it.
4. **Structure (Phase 3):** lay out the sections of [the prompt contract](references/prompt-contract.md) in the profile's format. Give an absolute launch folder, specific starting evidence, exact write scope, selected skill paths, observable gates and a useful fallback for unavailable evidence. Include the execution-time activity recheck: lists become stale after generation.
5. **Grade:** score every prompt with the composer's 100-point rubric. The composer sets no pass mark, so this skill sets one: revise any prompt below 85 and regrade it. Report a prompt that stays below 85 with its weakness.

These prompts run once. Skip the composer's save-to-`prompts/` question unless the user asks to keep a prompt.

## 5. Recommend two models and an effort level per prompt

Do this on every run, after the prompts pass grading. The task decides the pick.

1. Load live facts once: `leo_orchestrator_capabilities` (models and accounts that can run work), `leo_usage_status` (session and weekly percent left per account) and `leo_model_benchmarks` for the candidate models (BenchLM coding, agentic and reasoning scores, price, speed). Credit BenchLM.ai when you show numbers. Each source keeps its own scale: do not add scores across sources.
2. Remove accounts that cannot take work: not signed in, disabled, `at_limit`, `near_limit`, or under 10 percent of the weekly window left. When two accounts offer the same model, pick the one with more headroom and name it.
3. Match the model to the dominant work of the prompt. Code and refactors: coding score. Browser or shell work with many tool calls: agentic score. Analysis, writing, legal and security drafts: reasoning score plus the stakes rule in [`tools/model-router.md`](../../../tools/model-router.md). Break ties by lower price, then higher speed.
4. Apply the router limits. Never pick a Flash or Luna class model for security, money, legal, migration or final-review work. Note `effortMeasured=false`. Never pick a model that the capabilities list omits.
5. Pick exactly two: a primary and a runner-up. Use a different provider or account for the runner-up when a ready one fits, so one quota or outage does not stop the run. Give one effort level per prompt: `low` for routine or mechanical work, `medium` for broad changes, `high` only for explicit complex reasoning.
6. Give each pick one short reason that cites a number or a rule. Picks are advice. Do not switch the session model, delegate, or spawn agents to test them. Keep model text out of the prompt body: the user picks the model in the app.

If a tool fails, name it, use the router file and the model names in the session, and mark the picks unverified.

## 6. Refresh and present

Refresh activity for selected projects just before output. Replace newly conflicting candidates. Report the scan timestamp, projects covered, coverage gaps and concise excluded-work examples without exposing private data.

Show a ranked table: task, project, origin (existing work or fresh opportunity), why now, skills, expected user attention, composer score, model 1, model 2 and effort. State the source mix in one line and say that prompt-composer was read this run. Then provide ten numbered prompts, each in its own copyable code block. Put one line under each block: `Run with: <model 1> (<account>), fallback <model 2> (<account>), effort <level>. Why: <reason>`. Keep skill names inside each prompt, not only in the table. State that prompts have not been executed and that generation-time clearance is not a reservation.

Do not create ten task cards or persist the generated prompts unless asked. Reuse or capture the execution task when a prompt is actually run, according to its project's rules.

## Done when

- Every accessible registered project has been considered; inaccessible scope is reported.
- Each selected candidate has fresh activity evidence and passes both active-work and pairwise overlap checks.
- Both existing-work and fresh-opportunity pools were inspected; origin labels and the selected mix are shown.
- Ten prompts are delivered, or the smaller verified count and reason are explicit.
- `prompt-composer` was read in full this run, and each prompt went through its pipeline and carries a rubric score of 85 or more, or a stated weakness.
- Each prompt names verified relevant skills, bounded ownership, a launch-time recheck, unattended fallback and observable acceptance checks.
- Each prompt has two model picks, one effort level and a one-line reason from live capability, usage and benchmark data, or a stated tool gap.
- No proposed task was launched, and no absent user reply was treated as authorization.

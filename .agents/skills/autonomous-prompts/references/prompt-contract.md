# Prompt contract

`prompt-composer` governs prompt structure and grading. Use this file as a fallback only when that skill is missing. Section map when the composer is loaded: goal line and scope are the task, starting evidence and skill paths are the context, ownership and recheck and approval lines are the rules, and the verify and finish lines are the verification.

Adapt this structure to the task. Replace every placeholder before output; each prompt must work independently of the surrounding reply.

```text
Work in <absolute project root>. Goal: <one concrete outcome and its user value>.

Load this project's operating instructions, then load <verified primary skill path> and <required supporting skill paths>. Follow their approval and verification gates. Starting evidence: <specific files, failing checks or observed gap>.

Before any edit, refresh project threads and subagents, relevant task state and local changes. Generation-time scan: <timestamp and sources>; excluded active scope: <relevant identifiers and ownership>. If this objective, write scope or shared contract now overlaps active or uncertain work, make no edits and report the collision with evidence. Never continue merely because a branch is different.

Own <bounded files/modules/artifact>. Preserve <relevant active work and shared contracts>. Reuse existing work instead of duplicating it. Create or reuse a task card only as the project's workflow requires. Follow local Git rules and stage only owned changes.

Execute without routine questions. Choose reversible details from project conventions and record consequential assumptions. Scope and finish: <specific behavior and limits>. Verify <exact commands when known, otherwise the observable acceptance conditions and how to discover the correct checks>. Prove the failure before a bug fix; distinguish static inspection from observed runtime behavior.

If <plausible missing input/tool> is unavailable, complete <bounded useful fallback> and identify the unverified gate. Keep approval-gated actions as concrete reviewable proposals; continue independent authorized work. Do not spend money, request new credentials, send messages or perform destructive operations without existing authorization.

Finish with <artifact or working change>, acceptance results, performance evidence when required, scoped commit state, task checkpoint and unresolved limitations. A failed or unrun required check remains open.
```

## Selection checks

Apply these cases before final output:

| Case                                                                          | Required behavior                                                                  |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| No task card exists, but a reproducible defect does                           | Candidate may qualify; prompt captures work at execution                           |
| No card or known defect exists, but a useful improvement has project evidence | Candidate may qualify with a bounded outcome and observable checks                 |
| Ten existing cards qualify before fresh opportunities are explored            | Search the fresh pool before final selection; aim for a balanced mix               |
| Running child touches the candidate's shared schema                           | Exclude even when filenames differ                                                 |
| Idle unsettled thread has unfinished changes                                  | Inspect intent and ownership; exclude if uncertain                                 |
| Thread listing is unavailable for a project                                   | Report the gap; exclude work with unverified ownership                             |
| Two prompts need writes to the same generated index                           | Resolve ownership or replace one; do not call them independent                     |
| Chosen skill requires an unanswered interview                                 | Replace the workflow or candidate; preserve the gate                               |
| Skill exists only in the generator's workspace                                | Verify access in the target; provide an authorized path or replace it              |
| Selected task needs a paid service or account login                           | Select a useful local outcome or exclude                                           |
| Work starts in another thread after generation                                | Execution-time preflight stops edits and reports collision                         |
| Only seven candidates pass                                                    | Return seven with reasons rather than unsafe padding                               |
| One project is inaccessible                                                   | List it under coverage gaps; make no global clearance claim                        |
| User asks only for prompts                                                    | Generate prompts; launch no tasks or agents                                        |
| Only one ready account has the best model                                     | Name it as model 1, pick a runner-up from another account or provider, and say why |
| `leo_usage_status` or `leo_model_benchmarks` fails                            | Use `tools/model-router.md`, mark the model picks unverified                       |

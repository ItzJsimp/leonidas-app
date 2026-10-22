---
type: project
id: project-leonidas-code
name: "Leonidas Code"
status: "Active"
owner: leonidas
scope: structural
category: app
description: "Shared Jake + Mob fork of T3 Code (MIT) as the single agent harness replacing the Claude Code front end and Antigravity: shared repo, push-to-update releases, synced task board, rebrand to Leonidas Code."
created: 2026-10-09
verified: 2026-10-10
tasks:
  - "tasks/approve-and-verify-the-aios-identity-link-in-the-t3-repo-then-roll-it-out-to-mob.md"
  - "tasks/leonidas-code-agent-activity-bar-live-sliver-above-the-composer-that-expands-into-plan-steps-files-and-reasoning.md"
  - "tasks/leonidas-code-dev-instance-isolation-and-hot-safe-live-edits.md"
  - "tasks/leonidas-code-goal-loop-keep-a-thread-working-until-a-verified-condition-holds.md"
  - "tasks/leonidas-code-hierarchical-tiered-orchestration-workflow.md"
  - "tasks/leonidas-code-limit-failover-when-one-subscription-hits-its-limit-another-provider-takes-over-the-same-chat-in-one-click.md"
  - "tasks/leonidas-code-settings-parity-for-jake-and-mob.md"
  - "tasks/move-leonidas-code-repo-into-projectsleonidas-code-with-the-project-template.md"
  - "tasks/t3-code-prompt-predictor-from-scribe-transcripts.md"
  - "tasks/t3-code-push-to-update-release-pipeline.md"
  - "tasks/t3-code-rebrand.md"
  - "tasks/t3-code-shared-repo-from-mob-build.md"
  - "tasks/t3-code-synced-task-board.md"
---

# Leonidas Code: project ledger

- **Inputs:** Mob's modified T3 Code build, upstream `pingdotgg/t3code`, the fork `ItzJsimp/leonidas-code` (renamed from `ItzJsimp/t3code` 2026-10-10). The repo is this folder (`projects/leonidas-code/`, [ADR-0072](../../decisions/0072-code-projects-live-inside-the-aios-as-their-own-git-repos-with-a-workspace-layer.md)).
- **Outputs:** one shared GitHub repo both machines build from; Windows installer per push; task board synced between both instances.
- **Feedback:** the app's own update toast proves the pipeline; the task board proves sync when a task added on one machine shows on the other.

Why it exists and how it fits the one Leonidas app: [`origin-story.md`](../leonidas-product/origin-story.md).

Plan, findings and open decisions: [`project/plan.md`](./project/plan.md); agent playbook: [`agent-playbook.md`](./agent-playbook.md); shared brief: [`LEONIDAS.md`](./LEONIDAS.md).

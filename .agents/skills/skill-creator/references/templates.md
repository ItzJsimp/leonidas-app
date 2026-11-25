# Skill templates

Starter templates for a new skill. The tag keys follow the skill standard: engine keys at the top level, every AIOS tag under `metadata:`. In a repo with no AIOS, drop the `metadata:` block.

## 1. Model-invoked skill

Use when the agent must reach the skill on its own, or another skill must.

```markdown
---
name: "kebab-case-name"
description: "Front-loaded action verb describing what this skill does, in 1,024 characters or fewer. Use when situation A, situation B."
metadata:
  scope: structural
  category: "<id from .agents/skills/_categories.json>"
  reach: aios
  distribution: portable
---

# Title of the Skill

One-line mission statement: the outcome of this skill.

## 1. Procedure

1. **Step 1:** First concrete action, ending on a checkable gate.
2. **Step 2:** Second action.
3. **Step 3:** Next action.

## Done when

- A clear, observable state confirms the work is finished.
- A verification script or test command exits 0.
```

## 2. User-invoked skill

Use for manual workflows, destructive scripts and developer checklists that must not start by themselves. It costs no listing tokens.

```markdown
---
name: "kebab-case-name"
description: "Human-facing summary of this manual workflow."
disable-model-invocation: true
metadata:
  scope: structural
  category: "<id from .agents/skills/_categories.json>"
  reach: aios
  distribution: portable
---

# Title of the Manual Skill

The procedure, run only when the user types /kebab-case-name.

## 1. Steps

1. **Step 1:** Instruction for the operator.
2. **Step 2:** Follow-up check.

## Done when

- The operator confirms completion, or a named command exits 0.
```

## 3. Router skill

Use to group several user-invoked skills under one entry point. It can only hint: user-invoked skills have no description, so nothing but the human can start them.

```markdown
---
name: "kebab-router-name"
description: "Route domain tasks across specialized child skills."
disable-model-invocation: true
metadata:
  scope: structural
  category: "<id from .agents/skills/_categories.json>"
  reach: aios
  distribution: portable
---

# Domain Router

Guides the operator to the right specialized skill for the active task.

## Routing ladder

| Condition or task type | Skill         | Invocation     |
| ---------------------- | ------------- | -------------- |
| Specific task A        | child-skill-a | /child-skill-a |
| Specific task B        | child-skill-b | /child-skill-b |

## Procedure

1. Match the task to a row of the ladder.
2. Tell the user the skill to type.

## Done when

- The user has the name of the one skill that fits the task.
```

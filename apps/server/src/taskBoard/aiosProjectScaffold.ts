// @effect-diagnostics nodeBuiltinImport:off - synchronous node file APIs are used on purpose in this file.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

/**
 * The AIOS project template: the folder every new project starts from. A copy ships in each
 * user's AIOS at `templates/project-template`. Keep the two in step by hand.
 * `{{...}}` marks a value the app fills in. The other marks are facts the owner gives later.
 */
const TEMPLATE_FILES: ReadonlyArray<readonly [path: string, content: string]> = [
  [
    "AGENTS.md",
    `# {{PROJECT_NAME}}

{{ONE_LINE_PURPOSE}}

This file is the router for every agent that works in this folder. Read it first. Open the other files only when the task needs them.

## 1. Load the owner's AIOS first (small files only)

This folder lives inside its owner's AIOS at \`../../\`. If \`../../AGENTS.md\` exists, read it. Then read \`../../memory/operator.md\` and \`../../memory/soul.md\`. Read nothing else from the AIOS unless the task needs it. If the AIOS is missing, work from this folder alone and say so once.

## 2. What this project is

- **Goal:** TODO: the result this project must reach, in one sentence.
- **Status:** TODO: idea, planning, building, or live.
- **Owner:** TODO: the person who decides.
- **Done looks like:** TODO: how the owner knows the project is finished.

## 3. Rules

1. **Task first.** Make a task card in the AIOS \`tasks/\` folder with \`project: {{PROJECT_SLUG}}\` before substantive work. Do not add a task folder here.
2. **Stay in scope.** Work on this project only. If a request belongs to another project, say so and stop.
3. **Verify before done.** Run the check that proves the result. Report what you ran and what it showed.
4. **Write back.** At the end of each session, add one line to section 7 of [agent-playbook.md](./agent-playbook.md). Update the Feedback section of [project.md](./project.md) when a milestone ends.
5. **Keep secrets out.** No keys, passwords, tokens or private paths in any file here.
6. **Ask when unsure.** A short question costs less than a wrong build.

## 4. Where things live

| Need | File |
| --- | --- |
| What we build and why | [spec.md](./spec.md) |
| Project ledger: inputs, process, outputs, feedback | [project.md](./project.md) |
| What past sessions learned: map, traps, checks | [agent-playbook.md](./agent-playbook.md) |
| Research and sources | [research/](./research/README.md) |
| Detailed working rules | [.agents/rules/working-rules.md](./.agents/rules/working-rules.md) |
| Skills only this project uses | \`.agents/skills/\` |

## 5. Unfilled marks

Search this folder for \`TODO:\`. Each mark is a fact the owner has not given yet. Fill a mark only with a fact you know. Never invent one. Ask the owner for the rest.
`,
  ],
  ["CLAUDE.md", "@AGENTS.md\n"],
  [
    "project.md",
    `---
type: project
id: project-{{PROJECT_SLUG}}
name: "{{PROJECT_NAME}}"
status: "Active"
description: "{{ONE_LINE_PURPOSE}}"
scope: personal
created: "{{DATE}}"
tasks: []
---
# {{PROJECT_NAME}}

## Inputs

TODO: what this project started from. Ideas, references, the problem it solves.

## Process

TODO: how the agent helps. The steps you repeat, and how often.

## Outputs

TODO: what this project produces. Link each file or result in this folder.

## Feedback

TODO: did it work? What would you change next time? Fill this in at each milestone.
`,
  ],
  [
    "spec.md",
    `# {{PROJECT_NAME}}: spec

Fill this in before you build. Keep each answer short.

## 1. Problem and audience

- **Problem:** TODO: what is wrong or missing today.
- **Who it is for:** TODO: the people who use the result.

## 2. What it must do

TODO: three to seven capabilities, one line each. Put the most important first.

## 3. What it will not do

TODO: the things that are out of scope. This list stops the project from growing.

## 4. How we know it works

TODO: the checks that prove each capability works.

## 5. Open questions

TODO: facts nobody knows yet. Name who can answer each one.
`,
  ],
  [
    "agent-playbook.md",
    `# {{PROJECT_NAME}}: agent playbook

Read this before you change anything. Every session updates it before the session ends.

## 1. Start here (under 5 calls)

1. Read [spec.md](./spec.md) and the open task cards for \`project: {{PROJECT_SLUG}}\`.
2. Run the one health check: TODO: command that proves the project works now.
3. Open only the files the task names. Use the map in section 2.

## 2. Map

| Area | Files | Check |
| --- | --- | --- |
| TODO | TODO | TODO |

## 3. Data and tools

| Source or tool | How to reach it | Trap |
| --- | --- | --- |
| TODO | TODO | TODO |

## 4. Fast build and verify loop

1. TODO: the cheapest proof first, the slowest last.

## 5. Gotchas already paid for

- **TODO: short name.** What happened, what it cost, what to do instead.

## 6. Why it is this way

- **TODO: decision.** The reason, and where the longer note lives.

## 7. Session notes (newest first, one line each, keep 10)

- **{{DATE}}:** Project created from the AIOS project template.
`,
  ],
  [
    "research/README.md",
    `# {{PROJECT_NAME}}: research

Put each investigation in its own file named \`YYYY-MM-DD-topic.md\`. Start each file with the question. End it with the answer and the sources.

## Tracks

- TODO: the questions this project still has to answer.
`,
  ],
  [
    ".agents/rules/working-rules.md",
    `# Working rules for {{PROJECT_NAME}}

Read this file when you start a session or when a rule in [AGENTS.md](../../AGENTS.md) is not enough.

## Start a session

1. Read the open task cards for \`project: {{PROJECT_SLUG}}\`. Continue a card before you start a new one.
2. Read the last lines of section 7 in [agent-playbook.md](../../agent-playbook.md).
3. State the plan in two sentences before you change a file.

## During a session

- Make the smallest change that solves the task.
- Save a decision the owner makes in \`spec.md\` or \`agent-playbook.md\` in the same turn.
- Put a task you will not finish now on a task card. Do not leave it in chat.

## End a session

1. Run the check that proves the result.
2. Add one line to section 7 of \`agent-playbook.md\`: date, what changed, what is next.
3. Update the task card. Mark it done only after the check passes.
`,
  ],
  [".agents/skills/.gitkeep", ""],
];

export interface AiosProjectScaffoldInput {
  readonly root: string;
  readonly name: string;
  readonly purpose: string;
  readonly now?: Date;
}

/** Lowercase letters, digits and single hyphens, at most 60 characters. Never empty. */
export function projectSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "project";
}

/** One line with no quote or brace, so a value never breaks the YAML or a placeholder. */
const oneLine = (value: string) => value.replace(/\s+/g, " ").replace(/["{}]/g, "'").trim();

/**
 * Makes `<root>/projects/<slug>` from the template and returns the new folder. The folder is
 * claimed with a non-recursive `mkdir`, so a name that is taken gets `-2`, `-3`, and no file is
 * ever overwritten. A failed write removes the folder it made.
 */
export function scaffoldAiosProject(input: AiosProjectScaffoldInput): {
  readonly root: string;
  readonly slug: string;
} {
  const name = oneLine(input.name);
  if (name === "") throw new Error("The project needs a name.");
  const projectsDir = NodePath.join(input.root, "projects");
  NodeFS.mkdirSync(projectsDir, { recursive: true });

  const base = projectSlug(name);
  let slug = base;
  let folder = "";
  for (let n = 2; folder === ""; n++) {
    try {
      NodeFS.mkdirSync(NodePath.join(projectsDir, slug));
      folder = NodePath.join(projectsDir, slug);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || n > 99) throw error;
      slug = `${base.slice(0, 56)}-${n}`;
    }
  }

  const values: Record<string, string> = {
    PROJECT_NAME: name,
    PROJECT_SLUG: slug,
    ONE_LINE_PURPOSE: oneLine(input.purpose) || "TODO: what this project is, in one sentence.",
    // The owner's local day, as task cards use. `en-CA` prints YYYY-MM-DD.
    // @effect-diagnostics-next-line globalDate:off
    DATE: (input.now ?? new Date()).toLocaleDateString("en-CA"),
  };
  try {
    for (const [path, content] of TEMPLATE_FILES) {
      const target = NodePath.join(folder, path);
      NodeFS.mkdirSync(NodePath.dirname(target), { recursive: true });
      NodeFS.writeFileSync(
        target,
        content.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) => values[key] ?? match),
        { flag: "wx" },
      );
    }
  } catch (error) {
    NodeFS.rmSync(folder, { recursive: true, force: true });
    throw error;
  }
  return { root: folder, slug };
}

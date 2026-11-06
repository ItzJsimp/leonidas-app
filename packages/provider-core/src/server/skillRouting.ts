/**
 * Skill routing, appended to every provider's runtime instructions.
 *
 * Agents under-use skills: a design task runs without the design skills, a bug hunt without the
 * diagnosis skill. This block makes skill selection a step of every task, caps it at 5 so context
 * stays lean, and asks for one "Using <skill>: <reason>" line so the app can show the user which
 * skills the agent chose on its own and why. Keep that line format in step with the client parser.
 */
export const MAX_SKILLS_PER_TASK = 5;

export const SKILL_ROUTING_INSTRUCTIONS = `<skill_routing>
Skills hold the best known way to do each kind of work. Make skill selection the first step of every task.
- Before you act, compare the task with the skill list. Load each skill whose description matches the task, even when the user did not name it. Example: load the design skills for any screen, page, app or UI work.
- Load at most ${MAX_SKILLS_PER_TASK} skills for one task, most relevant first. Load each skill once, then follow its steps.
- When you load a skill on your own, start that message with one line: \`Using <skill>: <reason, 10 words or fewer>\`. Leonidas shows the user every skill you used and this reason.
</skill_routing>`;

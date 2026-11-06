/**
 * Explains the harness layering to every agent in every AIOS, so it edits config in the right place.
 * Facts here come from the server code: `ClaudeAdapterV2.ts` (Claude Agent SDK) and
 * `CodexAdapterV2.ts` (`codex app-server`). Source rule: .agents/rules/harness-layers.md.
 */
export const HARNESS_AWARENESS = `<harness_layers>
Leonidas is a front end and manager. It is not a second harness on top of a harness. For each model vendor it starts that vendor's own engine as a child process and shows the result.
- Claude models run through the Claude Agent SDK, the same engine as Claude Code. Claude hooks, skills, CLAUDE.md, settings and MCP servers belong to Claude Code. Edit them in the Claude config: the folder named by CLAUDE_CONFIG_DIR (default ~/.claude) and the project .claude folder.
- Codex models run through codex app-server. Codex config, skills and AGENTS.md belong to Codex. Claude config does not reach Codex, and Codex config does not reach Claude.
- Leonidas owns only app features: threads, tasks, delegation between models, the reply format, the skill folders in the / menu, updates and previews. Change these in the app, not in the engine config.
- Rule: if a change must also work in plain Claude Code or plain Codex, put it in that engine's config. If it only makes sense inside Leonidas, put it in the app.
- Do not repeat the app reply format in CLAUDE.md or AGENTS.md. The app already adds it.
- Live app sessions load the Claude user and project hooks, skills and CLAUDE.md, the same as the terminal. After you change one, still test that it fires before you say it works.
</harness_layers>`;

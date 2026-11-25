// @effect-diagnostics nodeBuiltinImport:off - temp dirs for a pure file-reading test
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  claudeConfigDirOf,
  codexPonytailState,
  ensureClaudePonytail,
  isPonytailPluginEnabled,
  PONYTAIL_INSTALL_OPT_IN_ENV,
} from "./PonytailEnsure.ts";

const tempDir = () => NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pt-"));
const writeSettings = (dir: string, value: unknown) =>
  NodeFS.writeFileSync(NodePath.join(dir, "settings.json"), JSON.stringify(value));

describe("PonytailEnsure", () => {
  it("reads the plugin switch from the account config dir", () => {
    const dir = tempDir();
    expect(isPonytailPluginEnabled({ CLAUDE_CONFIG_DIR: dir })).toBe(false);
    writeSettings(dir, { enabledPlugins: { "ponytail@ponytail": true } });
    expect(isPonytailPluginEnabled({ CLAUDE_CONFIG_DIR: dir })).toBe(true);
    writeSettings(dir, { enabledPlugins: { "ponytail@ponytail": false } });
    expect(isPonytailPluginEnabled({ CLAUDE_CONFIG_DIR: dir })).toBe(false);
  });

  it("defaults to ~/.claude when no config dir is set", () => {
    expect(claudeConfigDirOf({})).toBe(NodePath.join(NodeOS.homedir(), ".claude"));
  });

  // The install first checks that `node` runs, so the folder of the running Node is on PATH.
  // A real caller passes its whole environment; this one lists only what the test needs.
  const optIn = (dir: string) => ({
    CLAUDE_CONFIG_DIR: dir,
    PATH: NodePath.dirname(process.execPath),
    [PONYTAIL_INSTALL_OPT_IN_ENV]: "1",
  });

  it("does nothing until the user opts in", async () => {
    const dir = tempDir();
    expect(
      await ensureClaudePonytail({ binaryPath: "no-such-claude", env: { CLAUDE_CONFIG_DIR: dir } }),
    ).toBe("skipped");
  });

  it("leaves a user's choice alone, on or off", async () => {
    const dir = tempDir();
    writeSettings(dir, { enabledPlugins: { "ponytail@ponytail": false } });
    expect(await ensureClaudePonytail({ binaryPath: "no-such-claude", env: optIn(dir) })).toBe(
      "present",
    );
  });

  it("reports failure without throwing when the CLI is missing", async () => {
    const dir = tempDir();
    expect(await ensureClaudePonytail({ binaryPath: "no-such-claude", env: optIn(dir) })).toBe(
      "failed",
    );
  });

  it("reads the Codex plugin state from config.toml text", () => {
    const on = '[plugins."ponytail@ponytail"]\nenabled = true\n';
    const trusted = `${on}\n[hooks.state."ponytail@ponytail:hooks.json:session_start:0:0"]\ntrusted_hash = "sha256:x"\n`;
    expect(codexPonytailState(undefined)).toBe("off");
    expect(codexPonytailState('[plugins."pdf@x"]\nenabled = true\n')).toBe("off");
    expect(codexPonytailState('[plugins."ponytail@ponytail"]\nenabled = false\n')).toBe("off");
    expect(codexPonytailState(on)).toBe("needs-trust");
    expect(codexPonytailState(trusted)).toBe("on");
  });
});

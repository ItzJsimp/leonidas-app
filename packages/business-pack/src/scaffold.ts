// @effect-diagnostics nodeBuiltinImport:off - setup copies the template into a folder with plain node fs.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { TEMPLATE_FILES } from "./templateFiles.ts";

export interface ScaffoldInput {
  readonly id: string;
  readonly name: string;
  readonly ownerName: string;
  /** The GitHub login of the Owner. A business without one cannot tell who its Owner is. */
  readonly ownerGithub: string;
  readonly timezone: string;
}

// A value lands inside a quoted YAML string or a heading, so one plain line is enough.
const oneLine = (value: string) => value.replace(/["\\]/g, "").replace(/\s+/g, " ").trim();

export const ownerSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "owner";

/**
 * Writes the business template into `root`: the org record with the setup person as Owner, the
 * rules, the modes and the skills. A file that already exists is kept. Returns the files written.
 */
export function scaffoldBusiness(root: string, input: ScaffoldInput): number {
  const slug = ownerSlug(input.ownerName);
  const tokens: Record<string, string> = {
    __AI_NAME__: `${oneLine(input.name)} AI`,
    __BUSINESS_NAME__: oneLine(input.name),
    __WORKSPACE_ID__: input.id,
    __OWNER_NAME__: oneLine(input.ownerName),
    __OWNER_SLUG__: slug,
    __OWNER_GITHUB__: input.ownerGithub,
    __REPO_PREFIX__: input.id,
    __MISSION__: "Not set yet.",
    __TIMEZONE__: input.timezone,
  };
  let written = 0;
  for (const [name, text] of Object.entries(TEMPLATE_FILES)) {
    const target = NodePath.join(root, name.replaceAll("__OWNER_SLUG__", slug));
    try {
      NodeFS.lstatSync(target);
      continue;
    } catch {
      // Not there yet: write it.
    }
    NodeFS.mkdirSync(NodePath.dirname(target), { recursive: true });
    const filled = Object.entries(tokens).reduce(
      (out, [key, value]) => out.replaceAll(key, () => value),
      text,
    );
    NodeFS.writeFileSync(target, filled, "utf8");
    written += 1;
  }
  return written;
}

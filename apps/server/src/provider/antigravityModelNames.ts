/**
 * Display names for Antigravity models.
 *
 * Usage records carry either a text name or only a numeric model id. Names are
 * normalized here so the usage reader reports one stable model name.
 *
 * @module provider/antigravityModelNames
 */

export interface AntigravityModelName {
  /** Name shown on the usage page. Keeps the effort tier, such as `gemini-3.8-flash-high`. */
  readonly model: string;
  /** Rate-table key when `model` carries an effort tier the table does not know. */
  readonly rateModel?: string;
}

const EFFORT_TIERS = new Set(["minimal", "low", "medium", "high", "xhigh", "ultra", "max"]);

/**
 * Normalizes an Antigravity model label or slug (`Gemini 3.8 Flash (High)`) to a
 * usage model name. A Gemini effort tier stays in the name so rows split by
 * effort, and the untiered model becomes `rateModel` so pricing still resolves.
 * Other variant tags (`-thinking`, `-n`) are the same model and fold away.
 */
export function antigravityModelNameFromLabel(label: string): AntigravityModelName {
  const lower = label.toLowerCase().trim();
  const rawTag = lower.match(/\s*\(([^)]*)\)\s*$/)?.[1]?.trim();
  const tag = rawTag === "extra high" ? "xhigh" : rawTag;
  const stem = lower.replace(/\s*\([^)]*\)\s*$/, "").replaceAll(" ", "-");
  if (stem.startsWith("claude-")) {
    return {
      model: stem
        .replace(/^claude-(4(?:\.\d+)?)-(sonnet|opus|haiku)/, "claude-$2-$1")
        .replaceAll(".", "-"),
    };
  }
  const slug = tag !== undefined && EFFORT_TIERS.has(tag) ? `${stem}-${tag}` : stem;
  const tiered = slug.match(
    /^(gemini-[\d.]+-(?:pro|flash(?:-lite)?|argon|hydrogen|helium|lithium|neon))-(?:minimal|low|medium|high|xhigh|ultra|max)$/,
  );
  if (tiered?.[1] !== undefined) return { model: slug, rateModel: tiered[1] };
  return {
    model: slug.replace(
      /^(gemini-[\d.]+-(?:pro|flash(?:-lite)?|argon|hydrogen|helium|lithium|neon))-(?:thinking|[a-z])$/,
      "$1",
    ),
  };
}

import { defineRule } from "@oxlint/plugins";

import baseline from "./designValuesBaseline.json" with { type: "json" };
import { typedDesignValues } from "./designValues.ts";

const SOURCE_ROOT = "apps/web/src/";
const allowedByFile: Readonly<Record<string, number>> = baseline;

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Use motion and text size tokens (DESIGN.md M1, T1). Files with old typed values may not add more.",
    },
  },
  create(context) {
    return {
      Program(node) {
        const found = typedDesignValues(context.sourceCode.text);
        if (found.length === 0) return;
        const path = context.filename.replaceAll("\\", "/");
        const start = path.lastIndexOf(SOURCE_ROOT);
        const allowed = start < 0 ? 0 : (allowedByFile[path.slice(start)] ?? 0);
        if (found.length <= allowed) return;
        context.report({
          node,
          message: `This file has ${found.length} typed design values and may have ${allowed}: ${[...new Set(found)].join(", ")}. Use duration-micro, duration-entrance or a text token (DESIGN.md M1, T1).`,
        });
      },
    };
  },
});

import { assert, describe, it } from "@effect/vitest";
import { DOCK_HEADINGS } from "@t3tools/shared/outputDock";

import {
  AUTOPILOT_REPLY_STYLE,
  LEONIDAS_OUTPUT_STANDARD,
  LEONIDAS_RENDER_CONTRACT,
  LEONIDAS_REPLY_STYLE,
  leonidasOutputStandard,
} from "./outputStandard.ts";

describe("render contract and Leonidas reply style", () => {
  it("names every answer block type the chat can render", () => {
    for (const type of ["choices", "checklist", "table", "chart"]) {
      assert.include(LEONIDAS_RENDER_CONTRACT, `leo:${type}`);
    }
  });

  it("names every Dock heading the client parses, in each shipped style", () => {
    // Next Actions stays in the parser for old replies only.
    for (const heading of Object.keys(DOCK_HEADINGS).filter((h) => !h.includes("Next Actions"))) {
      for (const style of [LEONIDAS_REPLY_STYLE, AUTOPILOT_REPLY_STYLE]) {
        assert.include(style, heading);
      }
    }
  });

  // A custom style got the Leonidas TL;DR and cards because these rules sat in the contract.
  it("keeps the status line and Dock out of a custom style", () => {
    const custom = leonidasOutputStandard("Reply in plain, friendly paragraphs.");
    for (const part of ["### 🎯 TL;DR", "Status line", "Dock", "⏸️ Need you"]) {
      assert.notInclude(custom, part);
    }
  });

  it("keeps the shipped Leonidas style inside the preset cap, without the zone lock", () => {
    assert.isAtMost(LEONIDAS_REPLY_STYLE.length, 4_000);
    assert.notInclude(LEONIDAS_OUTPUT_STANDARD, "may not remove, reorder or rename");
  });

  it("names the exact status line the chat draws as pills, in each shipped style", () => {
    for (const part of ["✅ Done", "⏸️ Need you", "❌ Blocked", "🧠 None", "📍"]) {
      for (const style of [LEONIDAS_REPLY_STYLE, AUTOPILOT_REPLY_STYLE]) {
        assert.include(style, part);
      }
    }
  });

  it("caps the body at 200 words for Leonidas and 70 for Autopilot", () => {
    assert.include(LEONIDAS_REPLY_STYLE, "at most 200 words");
    assert.include(AUTOPILOT_REPLY_STYLE, "at most 70 words");
    assert.include(AUTOPILOT_REPLY_STYLE, "Ask only before");
    assert.notInclude(LEONIDAS_REPLY_STYLE, "Ask only before");
  });

  // Ratchet: 3,288 bytes was the Leonidas style before Autopilot existed.
  it("keeps each shipped style no larger than the old Leonidas style", () => {
    for (const style of [LEONIDAS_REPLY_STYLE, AUTOPILOT_REPLY_STYLE]) {
      assert.isAtMost(new TextEncoder().encode(style).length, 3_288);
    }
  });

  // Ratchet: every turn pays for this text. 5,198 was the single standard before the split.
  it("costs no more than the single standard it replaced", () => {
    assert.isAtMost(LEONIDAS_OUTPUT_STANDARD.length, 5_198);
  });
});

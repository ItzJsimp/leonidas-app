import { defineRule } from "@oxlint/plugins";

const HIDDEN = /(?:^|\s)opacity-0(?:\s|$)/u;
const HOVER_REVEAL = /(?:^|\s)group-hover(?:\/[\w-]+)?:opacity-100(?:\s|$)/u;
// A touch screen has no hover, so one of these must also show the control there.
const TOUCH_REVEAL = /(?:^|\s)(?:pointer-coarse|max-sm|max-md|any-hover):opacity-100(?:\s|$)/u;

const MESSAGE =
  "This control appears only on mouse hover, so a phone can never show it. Add pointer-coarse:opacity-100 (and pointer-coarse:pointer-events-auto if it is pointer-events-none), or suppress with the reason it must stay hidden on touch.";

function check(value: string): boolean {
  return HIDDEN.test(value) && HOVER_REVEAL.test(value) && !TOUCH_REVEAL.test(value);
}

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow class lists that reveal a control only on group hover, with no touch fallback.",
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === "string" && check(node.value)) {
          context.report({ node, message: MESSAGE });
        }
      },
      TemplateElement(node) {
        if (check(node.value.raw)) context.report({ node, message: MESSAGE });
      },
    };
  },
});

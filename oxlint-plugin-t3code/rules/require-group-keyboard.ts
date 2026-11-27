import { defineRule } from "@oxlint/plugins";

const GROUP_ROLES = new Set(["radiogroup", "tablist", "toolbar"]);

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require arrow key support on a hand-set radio group, tab list or toolbar element.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier" || !/^[a-z]/u.test(node.name.name)) return;

        let role: string | undefined;
        let handled = false;
        for (const attribute of node.attributes) {
          if (attribute.type !== "JSXAttribute" || attribute.name.type !== "JSXIdentifier")
            continue;
          const { name } = attribute.name;
          const value = attribute.value;
          if (name === "role" && value?.type === "Literal") role = String(value.value);
          if (name === "onKeyDown") handled = true;
          if (
            name === "ref" &&
            value?.type === "JSXExpressionContainer" &&
            value.expression.type === "Identifier" &&
            value.expression.name === "rovingGroup"
          ) {
            handled = true;
          }
        }
        if (handled || role === undefined || !GROUP_ROLES.has(role)) return;

        context.report({
          node,
          message: `A role="${role}" element needs arrow keys. Use a components/ui control, or add ref={rovingGroup} from ~/lib/rovingGroup.`,
        });
      },
    };
  },
});

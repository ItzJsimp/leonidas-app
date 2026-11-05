import { describe, expect, it } from "vite-plus/test";

import { columnTemplate } from "./TaskTable";

const columns = [
  { key: "title", width: 500, hidden: false },
  { key: "status", width: 128, hidden: false },
  { key: "due", width: 112, hidden: true },
];

describe("columnTemplate", () => {
  it("caps a frozen Name to part of the table and sizes the rest in pixels", () => {
    expect(columnTemplate(columns, true)).toEqual({
      template: "48px min(500px, 40cqi) 128px minmax(0, 1fr)",
      width: "calc(176px + min(500px, 40cqi))",
    });
  });

  it("keeps an unfrozen Name at its full width", () => {
    expect(columnTemplate(columns, false)).toEqual({
      template: "48px 500px 128px minmax(0, 1fr)",
      width: "676px",
    });
  });
});

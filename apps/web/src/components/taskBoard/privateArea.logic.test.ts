import { describe, expect, it } from "vite-plus/test";

import { privateAreaOptions, taskPrivateArea } from "./privateArea.logic";

describe("privateAreaOptions", () => {
  it("offers active Areas other than Home", () => {
    expect(
      privateAreaOptions([
        { slug: "home", name: "Home", status: "active" },
        { slug: "deals", name: "Deals", status: "active" },
        { slug: "old", name: "Old", status: "archived" },
      ]),
    ).toEqual([{ slug: "deals", name: "Deals" }]);
  });
});

describe("taskPrivateArea", () => {
  it("reads the Area of a private task and nothing for a public one", () => {
    expect(taskPrivateArea({ labels: ["private", "area:deals"] })).toBe("deals");
    expect(taskPrivateArea({ labels: ["area:deals"] })).toBeNull();
    expect(taskPrivateArea({ labels: ["private"] })).toBeNull();
  });
});

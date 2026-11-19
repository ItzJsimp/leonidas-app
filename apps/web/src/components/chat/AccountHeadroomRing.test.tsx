import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { AccountHeadroomRing } from "./AccountHeadroomRing";

describe("AccountHeadroomRing", () => {
  it("draws an arc as long as the quota left", () => {
    const html = renderToStaticMarkup(<AccountHeadroomRing leftPercent={62} severity="normal" />);
    expect(html).toContain('stroke-dasharray="62 100"');
    expect(html).toContain("stroke-info");
  });

  it("changes color as the quota runs low", () => {
    const warning = renderToStaticMarkup(
      <AccountHeadroomRing leftPercent={30} severity="warning" />,
    );
    const critical = renderToStaticMarkup(
      <AccountHeadroomRing leftPercent={5} severity="critical" />,
    );
    expect(warning).toContain("stroke-warning");
    expect(critical).toContain("stroke-destructive");
  });
});

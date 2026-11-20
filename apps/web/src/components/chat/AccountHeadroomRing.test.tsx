import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { AccountHeadroomRing } from "./AccountHeadroomRing";

describe("AccountHeadroomRing", () => {
  it("draws nothing while plenty of quota is left", () => {
    expect(renderToStaticMarkup(<AccountHeadroomRing leftPercent={62} severity="normal" />)).toBe(
      "",
    );
  });

  it("draws an arc as long as the quota left when it runs low", () => {
    const html = renderToStaticMarkup(<AccountHeadroomRing leftPercent={30} severity="warning" />);
    expect(html).toContain('stroke-dasharray="30 100"');
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

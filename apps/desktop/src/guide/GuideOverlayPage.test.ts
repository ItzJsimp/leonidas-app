import { assert, describe, it } from "vite-plus/test";

import { renderGuideOverlayPage } from "./GuideOverlayPage.ts";

describe("GuideOverlayPage", () => {
  it("renders overlay HTML with transparent click-through styles", () => {
    const html = renderGuideOverlayPage({
      displayId: 1,
      scaleFactor: 1.25,
    });

    assert.include(html, "pointer-events: none !important");
    assert.include(html, "background: transparent");
    assert.include(html, 'id="highlight-ring"');
    assert.include(html, 'id="pointer-avatar"');
    assert.include(html, 'id="callout-badge"');
    assert.include(html, '"scale":1.25');
  });

  it("includes CSP restricting external resources", () => {
    const html = renderGuideOverlayPage({
      displayId: 2,
      scaleFactor: 1.0,
    });

    assert.include(
      html,
      "Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    );
  });

  it("binds to window.leonidasGuide bridge and postMessage", () => {
    const html = renderGuideOverlayPage({
      displayId: 1,
      scaleFactor: 2.0,
    });

    assert.include(html, "window.leonidasGuide");
    assert.include(html, 'addEventListener("message"');
    assert.include(html, "updateView(state)");
  });
});

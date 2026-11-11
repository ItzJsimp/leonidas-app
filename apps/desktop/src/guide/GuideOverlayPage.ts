export type GuideOverlayPageInput = {
  readonly displayId: number;
  readonly scaleFactor: number;
};

export function renderGuideOverlayPage(input: GuideOverlayPageInput): string {
  const config = JSON.stringify({
    displayId: input.displayId,
    scale: input.scaleFactor,
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Leonidas Guide</title>
<style>
* { box-sizing: border-box; }
html, body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: transparent;
  pointer-events: none !important;
  user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

#overlay-container {
  position: fixed;
  inset: 0;
  pointer-events: none !important;
  opacity: 0;
  transition: opacity 200ms ease-in-out;
}

#overlay-container.active {
  opacity: 1;
}

/* Spotlight highlight ring around target UI element */
#highlight-ring {
  position: fixed;
  display: none;
  pointer-events: none !important;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25), 0 4px 16px rgba(0, 0, 0, 0.2);
  transition: all 180ms cubic-bezier(0.16, 1, 0.3, 1);
  animation: pulse-ring 2s infinite ease-in-out;
}

@keyframes pulse-ring {
  0%, 100% { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.35), 0 4px 16px rgba(0, 0, 0, 0.2); }
  50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.15), 0 6px 20px rgba(0, 0, 0, 0.3); }
}

/* Cursor companion avatar/arrow */
#pointer-avatar {
  position: fixed;
  display: none;
  pointer-events: none !important;
  width: 28px;
  height: 28px;
  z-index: 1000;
  transition: transform 150ms cubic-bezier(0.16, 1, 0.3, 1);
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35));
}

/* Informational Callout Badge */
#callout-badge {
  position: fixed;
  display: none;
  pointer-events: none !important;
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(8px);
  color: #f8fafc;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  max-width: 280px;
  z-index: 1001;
  font-size: 13px;
  line-height: 1.4;
  transition: transform 150ms ease-out;
}

#callout-step {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #60a5fa;
  margin-bottom: 2px;
}

#callout-text {
  font-weight: 500;
}
</style>
</head>
<body>
<div id="overlay-container">
  <div id="highlight-ring"></div>
  <div id="pointer-avatar">
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#2563eb" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>
    </svg>
  </div>
  <div id="callout-badge">
    <div id="callout-step"></div>
    <div id="callout-text"></div>
  </div>
</div>
<script>
(() => {
  const config = ${config};
  const container = document.getElementById("overlay-container");
  const ring = document.getElementById("highlight-ring");
  const avatar = document.getElementById("pointer-avatar");
  const callout = document.getElementById("callout-badge");
  const stepLabel = document.getElementById("callout-step");
  const textLabel = document.getElementById("callout-text");

  const bridge = window.leonidasGuide;

  function updateView(state) {
    if (!state || !state.visible) {
      container.classList.remove("active");
      ring.style.display = "none";
      avatar.style.display = "none";
      callout.style.display = "none";
      return;
    }

    container.classList.add("active");

    if (state.highlight) {
      ring.style.display = "block";
      ring.style.left = state.highlight.x + "px";
      ring.style.top = state.highlight.y + "px";
      ring.style.width = state.highlight.width + "px";
      ring.style.height = state.highlight.height + "px";
    } else {
      ring.style.display = "none";
    }

    if (state.pointer) {
      avatar.style.display = "block";
      avatar.style.transform = "translate(" + state.pointer.x + "px, " + state.pointer.y + "px)";
    } else {
      avatar.style.display = "none";
    }

    if (state.text) {
      callout.style.display = "block";
      textLabel.textContent = state.text;
      if (state.step) {
        stepLabel.textContent = state.step;
        stepLabel.style.display = "block";
      } else {
        stepLabel.style.display = "none";
      }
      if (state.calloutPoint) {
        callout.style.transform = "translate(" + state.calloutPoint.x + "px, " + state.calloutPoint.y + "px)";
      }
    } else {
      callout.style.display = "none";
    }
  }

  if (bridge && typeof bridge.onUpdate === "function") {
    bridge.onUpdate(updateView);
  }

  // Fallback: window message listener
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "guide-update") {
      updateView(event.data.payload);
    }
  });
})();
</script>
</body>
</html>`;
}

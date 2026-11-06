---
name: "leonidas-canvas"
description: "Build and publish offline interactive canvases in Leonidas. Use when a reply needs a spec, architecture, research, roadmap or audit view, or when the body is over 400 words."
category: "design"
scope: "structural"
distribution: "template"
type: "skill"
id: "skill-leonidas-canvas"
title: "Leonidas Interactive Canvas"
kind: "procedure"
load: "on-demand"
owner: "leonidas"
verified: "2026-10-11"
related: ["design-build", "design-audit", "impeccable", "prompt-composer"]
license: MIT
---

# Leonidas canvas

Read this file before building a required canvas. The harness owns the reply shape; this skill owns the visual workflow. Progress notes, short answers and simple fixes use Markdown.

Use a canvas for specifications, architecture, research, roadmaps, audits, or a reply body over 400 words, excluding its Dock and fenced examples. Keep the final text to immediate decisions and the Dock.

## Build and verify

1. Group the result into 1 to 6 sections. Give each a short tab title and summary. Add only useful metrics, flows and tables.
2. Call `canvas` with `skillLoaded: true` after reading this file. The tool builds HTML; it does not publish anything.
3. Pass the returned HTML to `html_preview` at 728 and 390 pixels. Check the screenshots, content height and console errors; fix any overflow or unreadable labels.
4. Call `html_render` with the returned title, HTML and measured height. Only a successful render means the page was published.
5. Write the final reply without repeating the canvas. If a skill or required tool is unavailable, say which and provide a concise Markdown fallback.

Structured input example:

```json
{
  "skillLoaded": true,
  "title": "Release gates",
  "sections": [
    {
      "title": "Plan",
      "summary": "Ship each gate after its proof passes.",
      "metrics": [{ "label": "Gates", "value": "3" }],
      "flow": ["Build", "Verify", "Ship"],
      "columns": ["Gate", "Proof"],
      "rows": [
        ["Renderer", "Draft preserved"],
        ["Compliance", "Recorded once"]
      ]
    },
    { "title": "Risks", "summary": "Automatic repair waits for measured failure rates." }
  ]
}
```

## Custom diagrams

When the structured tool cannot express a system map, write one self-contained HTML document and use the same preview/render workflow. Native CSS, SVG and vanilla JavaScript only; no external fonts, images or CDN libraries. Use injected `--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`, `--border`, `--primary`, `--ring`, `--radius`, `--font-sans` and `--font-mono` variables. Theme changes must stay readable.

Tabs need `tablist`, `tab`, `tabpanel`, selected state and visible focus; support arrow keys, Home and End. Reserve the maximum panel height so tab switches do not jump. No continuously repainting animation. Wrap labels and let tables scroll inside their own container on narrow screens. Escape content before putting it into HTML or attributes.

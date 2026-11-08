---
name: "design-build"
description: "Design and build interfaces with project tokens and bounded visual review. Reuse approved designs for small edits; compare directions only for unresolved design choices."
category: design
scope: structural
distribution: template
type: skill
id: skill-design-build
title: "Design Build: from intent to a design that passes audit"
kind: procedure
load: on-demand
owner: leonidas
verified: 2026-09-28
related:
  [
    "design-audit",
    "impeccable",
    "standard-design-system",
    "app-building-standard",
    "ai-build-protocol",
  ]
license: MIT
---

# Design Build

Read the [design review limits](references/review-budget.md) first. Reuse an approved design for small edits.
New directions are for unresolved design choices. A skill invocation does not require a new contact sheet.

Turns "build me X" or "I don't like how this looks" into a finished design that passes [`design-audit`](../design-audit/SKILL.md). the user is not a designer: he picks from rendered options and never has to describe a design in words. This skill does the designer's work: reading the room, proposing directions, building on a design system, and proving the result.

Works for any project: new or existing apps (web, Qt, other desktop), pages, dashboards, generated HTML artifacts, and documents or PDFs. Impeccable is the engine for web craft; the Qt branch lives in [`references/qt-build.md`](references/qt-build.md).

## Steps

1. **Resolve the target and its canon.**
   - **Stack:** web, Qt, other desktop, static HTML, or document/PDF.
   - **Design system:** use the project's own if it has one (a `DESIGN.md`, a tokens file, a theme module). If it has none, start from AIOS canon: [`standards/design-system.md`](../../../standards/design-system.md) (Command register for apps and dashboards, Dispatch register for documents and PDFs) and [`standards/app-building-standard.md`](../../../standards/app-building-standard.md), with tokens from [`tokens.css`](../../../projects/leonidas-command-center/src/tokens.css) and fonts from [`assets/fonts/`](../../../assets/fonts/fonts.css).
   - **Exception:** a project with a deliberately different brand (a client site, a the peer AIOS asset) gets its own direction chosen in step 4, not AIOS colors. Ask one question if the brand is unclear.
2. **Audit what exists.** For a redesign, run [`design-audit`](../design-audit/SKILL.md) on the current state. Its P0 and P1 list is the brief's floor. For a new build, skip to step 3.
3. **Write the design read (one line) and the Build Menu.**
   - Design read: "Reading this as: <surface> where <user> <job>, <N> times a day, <impeccable mode>, <density>, on <canon>." Ask one question only if two reads diverge.
   - Build Menu per [`standards/ai-build-protocol.md`](../../../standards/ai-build-protocol.md) section 1: Core, Standard, Stretch, each with cost and default. For AIOS capabilities, say how it surfaces in the Command Center (section 1b).
   - Name 2 or 3 reference products the user already knows (Linear, Raycast, Arc, macOS System Settings, Apple Music, Stripe, Vercel dashboard) and what each does well for this job.
4. **Reuse or compare.** Reuse the approved frame when the request preserves its design. Otherwise render two directions on real tokens and data ([contact sheet](references/contact-sheet.md)). Use a third only when the user requests it. Record the existing approval or new pick on the task card. Follow the project's Doop workflow within the shared frame budget.
5. **Freeze the spec.** List files touched, components reused, states to build (empty, loading, error, long text), what's out of scope, and the end-to-end check. For a separate build chat this is the complete brief (ai-build-protocol 1c): it must not leave a design choice open.
6. **Build on the system.**
   - Every value comes from tokens, and every component from the project's existing helpers first. Invent only what does not exist, and add it to the shared helpers, not the page.
   - A new project with no system gets a tokens file on day one, copied from canon, before the first screen.
   - **Web and HTML:** follow impeccable new-work and its craft floor ([`../impeccable/reference/craft-floor.md`](../impeccable/reference/craft-floor.md)), then its `layout`, `typeset` and `clarify` references as needed.
   - **Qt:** follow [`references/qt-build.md`](references/qt-build.md).
   - **Documents and PDFs:** use the Dispatch register (paper tone, 64-72 character measure, doubled spacing), and embed the same font files.
   - **Motion:** only where [`references/motion.md`](references/motion.md) says it earns its place.
7. **Prove it.** Run [design-audit](../design-audit/SKILL.md) on the built result. Save the three required sizes locally. Use one combined comparison when useful, within the shared image limit. Keep routine QA images out of chat.

## Standing rules for anything built for the user

These come from the user's recorded preferences ([`memory/observed/patterns.md`](../../../memory/observed/patterns.md)) and the app standards. Apply them without asking; skip only the ones the surface cannot have (a PDF has no tooltips).

- **One-word navigation.** Tabs and sections use plain single words the way mainstream apps do.
- **Every control explains itself.** A tooltip on every button, badge and number: what it does, what it costs, what happens next.
- **Spend asks first.** Anything that spends AI usage or money, or spawns an agent, confirms engine, model and rough cost, then shows progress.
- **Dollars, not scores.** Money in dollars; vendor usage in the vendor's own meter.
- **Live and personal.** Time-aware greetings and status lines where they fit ("Late night, the user").
- **Teach a stranger.** Someone seeing it cold understands what it is for within 30 seconds.
- **One avatar.** For AIOS components, the Leonidas avatar is the icon; never design a new app mark.
- **Calm switch.** All motion and sound in apps respect it (app-building-standard section 6).
- **Dashboard first.** Accurate, visible, live state before new actions.

## Done when

1. The existing approval or new design pick is recorded, with the reused frame ID when available.
2. The result passes [design-audit](../design-audit/SKILL.md). Required screenshots are saved locally and the frame or evidence is linked.
3. No hex values, fonts or one-off components exist outside the project's token files and shared helpers.

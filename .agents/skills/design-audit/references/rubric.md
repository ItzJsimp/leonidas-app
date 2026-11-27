# Design audit rubric

Distilled 2026-09-27 from: impeccable's craft floor, Vercel Web Interface Guidelines, taste-skill (design-taste-frontend, redesign-existing-projects), Anthropic frontend-design, qt-ui-design, Emil Kowalski's design engineering, Apple design principles, addyosmani accessibility, and the user's standing preferences in `memory/observed/patterns.md`. Severity: **P0** blocks ship, **P1** fix before done, **P2** polish.

## 0. Frame the screen first

- Name the job in one line: "the user opens this to <do X>, about <N> times a day."
- High-frequency screens (10+ times a day) get zero decorative motion and maximum density of useful information. Rare screens can carry delight.
- The first thing the eye lands on must be the thing the user came for. If it is not, that is a P0 hierarchy failure.

## 1. Tokens and canon (every value has a source)

- **P0** A hex color, font family, or radius typed inline instead of a token (for example `var(--...)` on web, a theme dict or module in Qt). The project's token file is the only place values live. A project with no token file at all is a P1.
- **P0** A palette outside the resolved design system (for AIOS surfaces: anything off `design-system.md`, such as indigo `#6366f1`), AI purple gradients, or pure `#000000`.
- **P1** More than one accent competing on one screen. One accent leads; each accent has one job (in AIOS canon crimson acts, cyan is live, gold is attention), never all of them as decoration.
- **P1** Mixed gray families or inconsistent shadow light direction.
- **P2** Radius not nested (inner elements should be tighter than their container).

## 2. Layout and reflow

- **P0** Anything clipped, cut off, or overlapping at any of the 3 audit sizes. Text truncates with an ellipsis and a tooltip, never a hard chop.
- **P0** Horizontal scrollbar on a content page.
- **P1** A row holding more than about 5 controls with no wrap or overflow plan.
- **P1** Misaligned baselines or edges between side-by-side cards; buttons in a card group not bottom-aligned.
- **P1** Spacing not on the 4/8 px scale, or visibly uneven gaps between siblings.
- **P2** Optical centering off (icons next to text often need 1-2 px nudges).

## 3. Hierarchy and type

- **P0** No clear primary element; two things shout equally.
- **P1** Only two font weights in use (add 500 and 600 for quiet hierarchy), or hierarchy made with size alone instead of weight and color.
- **P1** Numbers in proportional figures where they are compared or update live (use tabular figures or a mono face).
- **P1** Body lines wider than about 75 characters.
- **P2** Label-style all-caps overused (max one small uppercase label per 3 sections).

## 4. States (the part AI always forgets)

- **P0** No empty state: a blank area or "None" where data would be. An empty state says what will appear and how to make it appear.
- **P0** No error state, or a raw exception, stack trace or HTTP code shown to the user. Errors say what failed and the next step.
- **P1** No loading state for anything that takes over 400 ms (Doherty threshold). Prefer a skeleton shaped like the result over a spinner.
- **P1** Live data without a "last updated" time.
- **P1** Controls with no hover, pressed and focus states.

## 5. Copy

- **P0** Coined or clever navigation labels. Tabs and nav use one plain word (Home, Tasks, History, Settings).
- **P1** Vague button labels ("OK", "Continue", "Submit"). Say what happens: "Save voice", "Replay".
- **P1** Filler words (elevate, seamless, unleash, next-gen), exclamation marks in success messages, "Oops".
- **P1** Fake-precise or placeholder data in a live app. Real data or a clearly labeled sample.
- **P1** Any em dash (U+2014). ADR-0012 applies to UI strings too.
- **P2** Missing live, personal micro-copy where a greeting or status could be time-aware ("Late night, the user").

## 6. Controls and trust

- **P0** A control that spends AI usage or money, or spawns an agent, without a confirmation naming engine, model and rough cost, and visible progress while it runs.
- **P0** A destructive action with no confirm or undo.
- **P1** A button, badge or number with no tooltip saying what it does, what it costs, and what happens next.
- **P1** Money shown as an abstract percent or score instead of dollars, or vendor usage not in the vendor's own meter.
- **P1** Two controls with the same intent and different labels on one screen.
- **P2** Primary and secondary actions not visually distinct (one filled primary per group).

## 7. Accessibility

- **P0** Text contrast under 4.5:1 (under 3:1 for large text, icons and focus rings).
- **P0** Anything reachable only by mouse. Every action works by keyboard, with a visible focus indicator.
- **P1** Meaning carried by color alone (a red dot with no label or icon).
- **P1** Click targets under 24 by 24 px.
- **P1** Icon-only buttons with no accessible name (web `aria-label`, Qt `setAccessibleName` plus tooltip).

## 8. Motion

Canon budgets: `app-building-standard.md` section 6 (micro 150 ms, entrance 240 ms, celebration up to 900 ms, ambient 12-20 s loops, Calm switch). Motion is expressive by the user's choice; the audit checks it is purposeful and on budget, not that it is absent.

- **P0** Animation on a keyboard-triggered or 100-times-a-day action.
- **P1** Micro or entrance motion over its budget, `ease-in` on anything entering, `transition: all`, or animating geometry instead of opacity and transform.
- **P1** Celebrations on routine events (they are for completed tasks and approvals), or more than one glowing element per region.
- **P1** Motion or sound that ignores the Calm switch (and `prefers-reduced-motion` on web).
- **P2** Popovers that do not scale from their trigger, or elements appearing from `scale(0)` (start at 0.95 with opacity 0).

## 9. The stranger test (the user's bar)

- **P1** A friend seeing this screen cold for the first time could not say within 30 seconds what it is for and what the main number means. Every screen explains itself, not only reports.

## AI tells (flag on sight, P1 unless noted)

Purple or blue "AI gradient"; neon outer glows beyond the one-glow-per-region rule; three identical equal-width feature cards; glassmorphism on everything; decorative colored dots with no semantic state; section-number eyebrows ("01 / Overview"); middle dots used as the separator for everything; generic avatars and "John Doe" data; version labels as decoration; div-built fake screenshots; Inter plus slate as the unexamined default.

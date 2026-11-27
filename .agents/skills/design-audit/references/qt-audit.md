# Qt (PySide6) audit add-on

For any Qt Widgets or QML app (PySide6, PyQt, C++). Impeccable and every public design skill target web, iOS or Android, so these checks cover what they miss. Run them after [`rubric.md`](rubric.md). Check against the app's own token module and shared widget helpers. Reference pattern in AIOS (from archived Python Scribe): a token module `ui/styles.py` `T` (mirroring `tokens.css`), shared helpers `ui/widgets.py`, and motion `ui/motion.py` (Calm switch via `motion.enabled()`).

## Capture screenshots (3 sizes)

Run inside the app process (a debug action or a one-off script that builds the view):

```python
from PySide6.QtWidgets import QApplication
def shoot(win, name):
    for w, h in ((1920, 1040), (960, 900), (win.minimumWidth() or 720, 600)):
        win.resize(w, h); QApplication.processEvents()
        win.grab().save(f"{name}-{w}x{h}.png")
```

`grab()` renders the widget tree exactly as painted, stylesheet included. Screenshot the whole window, not one widget, so clipping at the edges shows.

## Layout (the usual Qt failures)

- **P0** A top-level window or page with no minimum size, so it can be squeezed until controls overlap. Set `setMinimumSize` on the window and a sane minimum width on each page.
- **P0** A `QLabel` holding variable text (status, gate names, file paths) with no wrap and no elide. Use `setWordWrap(True)` for prose, or an elided label (`QFontMetrics.elidedText(..., Qt.ElideRight, width)` on resize) with the full text in `setToolTip`.
- **P1** A `QHBoxLayout` with more than about 5 widgets. Split into two rows (status above, actions below) or move secondary actions into a menu button.
- **P1** A page taller than the window with no `QScrollArea` (`setWidgetResizable(True)`, `NoFrame`, horizontal bar off).
- **P1** Stretch factors missing, so extra width lands in the wrong place (the label that needs room should get `addWidget(w, 1)`).
- **P1** Fixed pixel sizes on text containers; they break at 125 and 150 percent Windows scaling. Check at the user's actual scale.
- **P2** Margins and spacing not on the 4/8 scale (`setContentsMargins(16, 12, 16, 12)`, `setSpacing(8)` or `12`).

## Styling

- **P0** Hex values in a stylesheet string or `QColor("#...")` outside the app's token module (e.g. `styles.py` `T`).
- **P1** Per-widget `setStyleSheet` overriding the global sheet for something that should be an object name (`setObjectName("GhostBtn")`) styled once.
- **P1** A `QTableWidget` with default Qt chrome: grid lines on, alternating colors off, header not styled, row height default. Tables need hairline row dividers, a styled header, and tabular numbers.
- **P2** Native `QComboBox` popup and `QSpinBox` arrows left unstyled against the dark theme.

## Interaction

- **P0** Tab order broken or a control unreachable by keyboard. Test by pressing Tab through the page; fix with `setTabOrder`.
- **P0** No visible focus state on custom widgets (`:focus` in the sheet, using the design system's focus color; cyan in AIOS canon).
- **P1** A button or badge with no `setToolTip` saying what it does and what happens next.
- **P1** A long operation on the UI thread (HTTP calls, file scans). The window freezes; move it to a `QThread` or worker and show progress.
- **P1** Feedback missing after an action. Buttons confirm in place ("Saved") for about 1.5 s, then revert.
- **P2** Settings that require editing JSON by hand. Every knob the user would change has a control, and saves hot-reload without a restart.

## Motion

- **P1** Animations built directly with `QPropertyAnimation` instead of the app's shared motion helper, so they ignore the Calm switch.
- **P1** Animating geometry (`size`, `pos` of layout-managed widgets). Prefer opacity (`QGraphicsOpacityEffect`) and keep durations 150 to 250 ms.

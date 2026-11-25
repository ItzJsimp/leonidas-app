# Phone web app

This spec adds to the [design standard](../../DESIGN.md).

On a phone, Leonidas is the web app. A person opens it in the browser or adds it to the Home Screen ([setup](../user/phone-setup.md)). On the Home Screen it runs in standalone mode, with no browser back button. Leonidas ships no native phone app.

Phone quality matters, but it is not the top priority. Every screen gets the basic check. Pixel polish is not required.

## Layout

| Condition                                         | Result                                      |
| ------------------------------------------------- | ------------------------------------------- |
| Width under 768 px, or a short touch screen       | Phone layout (`useIsMobile`, `max-md`)      |
| Width under 728 px                                | The rail becomes a drawer                   |
| Touch screen with a height of 500 px or less      | Landscape phone: keep the main action visible |

## Basic check

Run it at 390x844 for every screen that you change.

- [ ] No icons, text or controls overlap.
- [ ] No control is cut off. The page does not scroll sideways.
- [ ] The main task of the screen works with touch only.
- [ ] Every deep view has its own back or close control.
- [ ] No action needs hover.
- [ ] Touch targets are 44 px. Use `touch-hit` on a smaller control.
- [ ] Text fields use 16 px text or more, so that iOS does not zoom (`--font-size-prompt-touch`).
- [ ] Fixed bars respect the safe areas (`env(safe-area-inset-*)`).
- [ ] With the keyboard open, the field and its send or save button stay visible.

Check in the preview browser at phone size. A real phone is the better check for the keyboard, the safe areas and touch.

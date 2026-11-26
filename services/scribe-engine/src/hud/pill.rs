//! The meeting pill: timer, level meters, Pause and Stop while a meeting records, "Paused", and
//! "Writing transcript" after Stop. Drawn from the Doop "A Capsule" design. It is the only pill
//! that takes clicks: `render_pill` also returns the button boxes.

use super::render::{
    blit_mask, fill, fill_circle, pill_outline, stroke, Mask, TextMask, BODY, EDGE, RED, WHITE,
};
use tiny_skia::{PathBuilder, Pixmap, Rect};

const MUTED: (u8, u8, u8, u8) = (150, 150, 155, 235);
const AMBER: (u8, u8, u8, u8) = (255, 159, 10, 255);
const BLUE: (u8, u8, u8, u8) = (59, 130, 246, 255);
const MIC: (u8, u8, u8, u8) = (45, 212, 191, 255);
const CALL: (u8, u8, u8, u8) = (167, 139, 250, 255);
const BUTTON_EDGE: (u8, u8, u8, u8) = (255, 255, 255, 56);
/// Bars per level meter.
const BARS: usize = 4;
/// How tall each bar gets, as a share of the loudest one: a fixed shape, not a spectrum.
const SHAPE: [f32; BARS] = [0.7, 1.0, 0.85, 0.55];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PillAction {
    Pause,
    Resume,
    Stop,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PillMode {
    Recording,
    Paused,
    /// After Stop: the transcript is written. `left` chunks still wait for the provider.
    Finishing {
        left: usize,
    },
}

/// What the meeting module says the pill should show.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PillState {
    pub mode: PillMode,
    /// Meeting time without pauses.
    pub elapsed_ms: u64,
    /// Peak level per track since the last tick: mic, then call audio. 0.0 to 1.0.
    pub levels: [f32; 2],
}

/// A button's box in pixmap pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Hit {
    pub x0: i32,
    pub y0: i32,
    pub x1: i32,
    pub y1: i32,
    pub action: PillAction,
}

impl Hit {
    pub fn contains(&self, x: i32, y: i32) -> bool {
        (self.x0..self.x1).contains(&x) && (self.y0..self.y1).contains(&y)
    }
}

/// The bars of both meters. Fast attack, slow release, so a word shows at once and fades out.
#[derive(Default)]
pub struct Meters {
    bars: [[f32; BARS]; 2],
}

impl Meters {
    pub fn update(&mut self, levels: [f32; 2]) {
        for (bars, level) in self.bars.iter_mut().zip(levels) {
            let level = level.clamp(0.0, 1.0).sqrt();
            for (bar, shape) in bars.iter_mut().zip(SHAPE) {
                let target = level * shape;
                *bar = if target > *bar {
                    target
                } else {
                    *bar * 0.8 + target * 0.2
                };
            }
        }
    }

    pub fn clear(&mut self) {
        self.bars = Default::default();
    }

    /// Bar heights in eighths. A frame whose key did not change needs no redraw.
    fn steps(&self) -> [[u8; BARS]; 2] {
        self.bars.map(|b| b.map(|v| (v * 8.0).round() as u8))
    }
}

/// Changes when the picture changes: the second, the mode, the blink and the bar heights.
pub type Key = (PillMode, u64, bool, [[u8; BARS]; 2]);

pub fn key(state: &PillState, meters: &Meters) -> Key {
    (
        state.mode,
        state.elapsed_ms / 1000,
        state.elapsed_ms / 800 % 2 == 1,
        meters.steps(),
    )
}

pub fn format_time(elapsed_ms: u64) -> String {
    let total = elapsed_ms / 1000;
    let (h, m, s) = (total / 3600, total / 60 % 60, total % 60);
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m:02}:{s:02}")
    }
}

/// Draw the pill. `phase` is seconds since the view started (spinner angle).
pub fn render_pill(
    state: &PillState,
    meters: &Meters,
    phase: f32,
    scale: f32,
    text: &dyn TextMask,
) -> Option<(Pixmap, Vec<Hit>)> {
    let s = scale.max(0.5);
    let px = (12.0 * s).round() as u32;
    let small_px = (11.0 * s).round() as u32;
    let (h, pad, pad_right, gap, btn) = ((40.0 * s).round(), 14.0 * s, 6.0 * s, 10.0 * s, 28.0 * s);
    let word = |t: &str, size: u32| text.mask(t, size);
    // The time keeps one width for "00:00", so the pill does not shake as digits change.
    let time = format_time(state.elapsed_ms);
    let time_mask = word(&time, px);
    let time_w = word(&"0".repeat(time.len()), px)
        .or_else(|| time_mask.clone())
        .map_or(0.0, |m| m.width as f32);
    let meters_w = (2.0 * (11.0 + 3.0 + 18.0) + 8.0) * s;
    let dot = 9.0 * s;
    let paused_mask = word("Paused", px);
    let (line1, line2) = match state.mode {
        PillMode::Finishing { left } => (
            word("Writing transcript", px),
            word(
                &match left {
                    0 => "Almost done".to_owned(),
                    1 => "1 part left".to_owned(),
                    n => format!("{n} parts left"),
                },
                small_px,
            ),
        ),
        _ => (None, None),
    };
    let width = match state.mode {
        PillMode::Recording => {
            pad + dot + gap + time_w + gap + meters_w + 2.0 * (gap + btn) + pad_right
        }
        PillMode::Paused => {
            pad + dot
                + gap
                + time_w
                + gap
                + paused_mask.as_ref().map_or(0.0, |m| m.width as f32)
                + 2.0 * (gap + btn)
                + pad_right
        }
        PillMode::Finishing { .. } => {
            let w = |m: &Option<Mask>| m.as_ref().map_or(0.0, |m| m.width as f32);
            pad + 14.0 * s + gap + w(&line1).max(w(&line2)) + 16.0 * s
        }
    }
    .round()
    .max(h);
    let mut pixmap = Pixmap::new(width as u32, h as u32)?;
    let r = h / 2.0;
    let mut pb = PathBuilder::new();
    pb.push_rect(Rect::from_xywh(r, 0.0, (width - h).max(0.0), h)?);
    pb.push_circle(r, r, r);
    pb.push_circle(width - r, r, r);
    fill(&mut pixmap, pb, BODY);
    stroke(&mut pixmap, pill_outline(width, h, 0.5 * s), EDGE, s);

    let cy = h / 2.0;
    let mut hits = Vec::new();
    let mut x = pad;
    let text_y = |m: &Mask| ((h - m.height as f32) / 2.0).round() as i32;
    match state.mode {
        PillMode::Recording | PillMode::Paused => {
            let paused = state.mode == PillMode::Paused;
            // The red dot blinks once a second while it records; the amber one stays still.
            let blink = !paused && state.elapsed_ms / 800 % 2 == 1;
            let dot_color = if paused {
                AMBER
            } else if blink {
                (RED.0, RED.1, RED.2, 90)
            } else {
                RED
            };
            fill_circle(&mut pixmap, x + dot / 2.0, cy, dot / 2.0, dot_color);
            x += dot + gap;
            if let Some(m) = &time_mask {
                blit_mask(
                    &mut pixmap,
                    m,
                    x.round() as i32,
                    text_y(m),
                    if paused { MUTED } else { WHITE },
                );
            }
            x += time_w + gap;
            if paused {
                if let Some(m) = &paused_mask {
                    blit_mask(&mut pixmap, m, x.round() as i32, text_y(m), AMBER);
                    x += m.width as f32;
                }
            } else {
                let steps = meters.steps();
                x = meter(&mut pixmap, x, cy, s, false, steps[0], MIC);
                x += 8.0 * s;
                x = meter(&mut pixmap, x, cy, s, true, steps[1], CALL);
            }
            x += gap;
            let (icon, action) = if paused {
                (Icon::Play, PillAction::Resume)
            } else {
                (Icon::Pause, PillAction::Pause)
            };
            button(&mut pixmap, &mut hits, x, cy, btn, s, icon, action);
            x += btn + gap;
            button(
                &mut pixmap,
                &mut hits,
                x,
                cy,
                btn,
                s,
                Icon::Stop,
                PillAction::Stop,
            );
        }
        PillMode::Finishing { .. } => {
            spinner(&mut pixmap, x + 7.0 * s, cy, s, phase);
            x += 14.0 * s + gap;
            if let (Some(a), Some(b)) = (&line1, &line2) {
                let top = ((h - (a.height + b.height) as f32 - s) / 2.0).round() as i32;
                blit_mask(&mut pixmap, a, x.round() as i32, top, WHITE);
                blit_mask(
                    &mut pixmap,
                    b,
                    x.round() as i32,
                    top + a.height as i32 + s as i32,
                    MUTED,
                );
            }
        }
    }
    Some((pixmap, hits))
}

#[derive(Clone, Copy)]
enum Icon {
    Pause,
    Play,
    Stop,
}

fn rect(pixmap: &mut Pixmap, x: f32, y: f32, w: f32, h: f32, c: (u8, u8, u8, u8)) {
    if let Some(r) = Rect::from_xywh(x, y, w, h) {
        let mut pb = PathBuilder::new();
        pb.push_rect(r);
        fill(pixmap, pb, c);
    }
}

#[allow(clippy::too_many_arguments)]
fn button(
    pixmap: &mut Pixmap,
    hits: &mut Vec<Hit>,
    x: f32,
    cy: f32,
    size: f32,
    s: f32,
    icon: Icon,
    action: PillAction,
) {
    let (cx, r) = (x + size / 2.0, size / 2.0);
    let red = matches!(icon, Icon::Stop);
    if red {
        fill_circle(pixmap, cx, cy, r, RED);
    } else {
        let mut pb = PathBuilder::new();
        pb.push_circle(cx, cy, r - 0.5 * s);
        stroke(pixmap, pb, BUTTON_EDGE, s);
    }
    match icon {
        Icon::Pause => {
            rect(pixmap, cx - 4.0 * s, cy - 4.5 * s, 2.8 * s, 9.0 * s, WHITE);
            rect(pixmap, cx + 1.2 * s, cy - 4.5 * s, 2.8 * s, 9.0 * s, WHITE);
        }
        Icon::Stop => rect(pixmap, cx - 3.5 * s, cy - 3.5 * s, 7.0 * s, 7.0 * s, WHITE),
        Icon::Play => {
            let mut pb = PathBuilder::new();
            pb.move_to(cx - 2.5 * s, cy - 4.5 * s);
            pb.line_to(cx - 2.5 * s, cy + 4.5 * s);
            pb.line_to(cx + 4.5 * s, cy);
            pb.close();
            fill(pixmap, pb, WHITE);
        }
    }
    hits.push(Hit {
        x0: x.floor() as i32,
        y0: (cy - r).floor() as i32,
        x1: (x + size).ceil() as i32,
        y1: (cy + r).ceil() as i32,
        action,
    });
}

/// A small icon (mic or speaker) and four bars. Returns the x after the meter.
fn meter(
    pixmap: &mut Pixmap,
    x: f32,
    cy: f32,
    s: f32,
    speaker: bool,
    steps: [u8; BARS],
    color: (u8, u8, u8, u8),
) -> f32 {
    let (ix, iy) = (x, cy - 6.0 * s);
    if speaker {
        let mut pb = PathBuilder::new();
        for (i, (px, py)) in [
            (1.5, 4.5),
            (3.5, 4.5),
            (6.5, 2.0),
            (6.5, 10.0),
            (3.5, 7.5),
            (1.5, 7.5),
        ]
        .iter()
        .enumerate()
        {
            let (px, py) = (ix + px * s, iy + py * s);
            if i == 0 {
                pb.move_to(px, py);
            } else {
                pb.line_to(px, py);
            }
        }
        pb.close();
        fill(pixmap, pb, MUTED);
        for r in [2.4, 4.4] {
            let mut pb = PathBuilder::new();
            for k in 0..=6 {
                let a = (-0.9 + 1.8 * k as f32 / 6.0) as f32;
                let (px, py) = (ix + (6.8 + r * a.cos()) * s, iy + (6.0 + r * a.sin()) * s);
                if k == 0 {
                    pb.move_to(px, py);
                } else {
                    pb.line_to(px, py);
                }
            }
            stroke(pixmap, pb, MUTED, 1.0 * s);
        }
    } else {
        let mut pb = PathBuilder::new();
        pb.push_oval(
            Rect::from_xywh(ix + 4.0 * s, iy + 1.0 * s, 4.0 * s, 6.0 * s)
                .unwrap_or(Rect::from_xywh(0.0, 0.0, 1.0, 1.0).unwrap()),
        );
        fill(pixmap, pb, MUTED);
        let mut pb = PathBuilder::new();
        for k in 0..=8 {
            let a = std::f32::consts::PI * k as f32 / 8.0;
            let (px, py) = (
                ix + (6.0 - 3.5 * a.cos()) * s,
                iy + (6.0 + 3.5 * a.sin()) * s,
            );
            if k == 0 {
                pb.move_to(px, py);
            } else {
                pb.line_to(px, py);
            }
        }
        pb.move_to(ix + 6.0 * s, iy + 9.5 * s);
        pb.line_to(ix + 6.0 * s, iy + 11.0 * s);
        stroke(pixmap, pb, MUTED, 1.0 * s);
    }
    let bx = x + 14.0 * s;
    let base = cy + 8.0 * s;
    for (i, step) in steps.iter().enumerate() {
        let bar_h = (3.0 + f32::from(*step) / 8.0 * 13.0) * s;
        rect(
            pixmap,
            bx + i as f32 * 5.0 * s,
            base - bar_h,
            3.0 * s,
            bar_h,
            color,
        );
    }
    bx + (BARS as f32 * 5.0 - 2.0) * s
}

fn spinner(pixmap: &mut Pixmap, cx: f32, cy: f32, s: f32, phase: f32) {
    let mut ring = PathBuilder::new();
    ring.push_circle(cx, cy, 5.5 * s);
    stroke(pixmap, ring, (255, 255, 255, 56), 2.0 * s);
    let start = phase * std::f32::consts::TAU * 1.0;
    let mut arc = PathBuilder::new();
    for k in 0..=12 {
        let a = start + k as f32 / 12.0 * std::f32::consts::TAU * 0.25;
        let (x, y) = (cx + 5.5 * s * a.cos(), cy + 5.5 * s * a.sin());
        if k == 0 {
            arc.move_to(x, y);
        } else {
            arc.line_to(x, y);
        }
    }
    stroke(pixmap, arc, BLUE, 2.0 * s);
}

#[cfg(test)]
mod tests {
    use super::*;

    struct BoxText;
    impl TextMask for BoxText {
        fn mask(&self, text: &str, px: u32) -> Option<Mask> {
            let width = text.chars().count() as u32 * px / 2;
            Some(Mask {
                width,
                height: px,
                alpha: vec![255; (width * px) as usize],
            })
        }
    }

    fn state(mode: PillMode) -> PillState {
        PillState {
            mode,
            elapsed_ms: 754_000,
            levels: [0.5, 0.2],
        }
    }

    #[test]
    fn time_has_minutes_and_hours() {
        assert_eq!(format_time(0), "00:00");
        assert_eq!(format_time(754_000), "12:34");
        assert_eq!(format_time(3_723_000), "1:02:03");
    }

    #[test]
    fn each_mode_draws_a_capsule_with_the_right_buttons() {
        for (mode, actions) in [
            (
                PillMode::Recording,
                vec![PillAction::Pause, PillAction::Stop],
            ),
            (PillMode::Paused, vec![PillAction::Resume, PillAction::Stop]),
            (PillMode::Finishing { left: 3 }, vec![]),
        ] {
            let (pixmap, hits) =
                render_pill(&state(mode), &Meters::default(), 0.0, 1.0, &BoxText).unwrap();
            assert_eq!(pixmap.pixel(0, 0).unwrap().alpha(), 0, "{mode:?} corner");
            let (w, h) = (pixmap.width() as i32, pixmap.height() as i32);
            assert_eq!(
                pixmap.pixel(w as u32 / 2, 2).unwrap().alpha() > 200,
                true,
                "{mode:?} body"
            );
            assert_eq!(
                hits.iter().map(|b| b.action).collect::<Vec<_>>(),
                actions,
                "{mode:?}"
            );
            for b in &hits {
                assert!(
                    b.x0 >= 0 && b.y0 >= 0 && b.x1 <= w && b.y1 <= h,
                    "{mode:?} inside"
                );
            }
            if let [a, b] = hits.as_slice() {
                assert!(a.x1 <= b.x0, "{mode:?} buttons do not overlap");
            }
        }
    }

    #[test]
    fn a_click_inside_a_button_hits_it_and_outside_does_not() {
        let (_, hits) = render_pill(
            &state(PillMode::Recording),
            &Meters::default(),
            0.0,
            1.0,
            &BoxText,
        )
        .unwrap();
        let stop = hits.iter().find(|b| b.action == PillAction::Stop).unwrap();
        assert!(stop.contains((stop.x0 + stop.x1) / 2, (stop.y0 + stop.y1) / 2));
        assert!(!stop.contains(stop.x0 - 1, stop.y0));
    }

    #[test]
    fn the_pill_does_not_change_width_when_the_digits_change() {
        let width = |ms| {
            let mut s = state(PillMode::Recording);
            s.elapsed_ms = ms;
            render_pill(&s, &Meters::default(), 0.0, 1.0, &BoxText)
                .unwrap()
                .0
                .width()
        };
        assert_eq!(width(61_000), width(599_000));
    }

    #[test]
    fn meters_rise_at_once_and_fall_slowly() {
        let mut m = Meters::default();
        m.update([1.0, 0.0]);
        let peak = m.bars[0][1];
        assert!(peak > 0.99 && m.bars[1][1] == 0.0);
        m.update([0.0, 0.0]);
        assert!(m.bars[0][1] < peak && m.bars[0][1] > 0.5, "slow release");
        for _ in 0..40 {
            m.update([0.0, 0.0]);
        }
        assert_eq!(m.steps(), [[0; BARS]; 2], "silence settles");
    }

    #[test]
    fn the_key_changes_only_when_the_picture_does() {
        let (m, s) = (Meters::default(), state(PillMode::Recording));
        let mut same_second = s;
        same_second.elapsed_ms += 100;
        assert_eq!(key(&s, &m), key(&same_second, &m));
        let mut next = s;
        next.elapsed_ms += 1000;
        assert_ne!(key(&s, &m), key(&next, &m));
        assert_ne!(key(&s, &m), key(&state(PillMode::Paused), &m));
    }
}

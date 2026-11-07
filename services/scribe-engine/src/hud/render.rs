//! Draws one pill frame into a premultiplied RGBA pixmap. Shapes use tiny-skia; text comes from a
//! `TextMask` (GDI on Windows), because tiny-skia has no text.

use super::View;
use tiny_skia::{
    Color, FillRule, LineCap, Paint, PathBuilder, Pixmap, PremultipliedColorU8, Stroke, Transform,
};

/// Bars in the recording waveform.
pub const BARS: usize = 12;
/// Text size in pixels at 100% scale.
const TEXT_PX: f32 = 13.0;

const BODY: (u8, u8, u8, u8) = (22, 22, 24, 235);
const WHITE: (u8, u8, u8, u8) = (255, 255, 255, 235);
const RED: (u8, u8, u8, u8) = (255, 69, 58, 255);
const GREEN: (u8, u8, u8, u8) = (48, 209, 88, 255);
/// Thin edge (about 12% white) so the pill reads on dark backgrounds.
const EDGE: (u8, u8, u8, u8) = (255, 255, 255, 31);

/// A text coverage mask: one alpha byte per pixel, rows top to bottom.
#[derive(Clone)]
pub struct Mask {
    pub width: u32,
    pub height: u32,
    pub alpha: Vec<u8>,
}

pub trait TextMask {
    fn mask(&self, text: &str, px: u32) -> Option<Mask>;
}

/// Draws no text. Tests and non-Windows builds use it.
pub struct NoText;

impl TextMask for NoText {
    fn mask(&self, _: &str, _: u32) -> Option<Mask> {
        None
    }
}

/// Draw `view`. `levels` are recent mic levels in 0..=1, oldest first; `phase` is seconds since
/// the view started (spinner angle). Returns `None` for `View::Hidden`.
pub fn render(
    view: &View,
    levels: &[f32],
    phase: f32,
    scale: f32,
    text: &dyn TextMask,
) -> Option<Pixmap> {
    let s = scale.max(0.5);
    let h = (36.0 * s).round();
    let pad = 12.0 * s;
    let icon = 18.0 * s;
    let gap = 8.0 * s;
    let label = match view {
        View::Hidden => return None,
        View::Recording => None,
        View::Transcribing => Some("Transcribing"),
        View::Done => Some("Done"),
        View::Error(message) => Some(message.as_str()),
        View::Meeting => Some("Recording meeting"),
    };
    let mask = label.and_then(|l| text.mask(l, (TEXT_PX * s).round() as u32));
    let content = match view {
        View::Recording => icon + gap + BARS as f32 * 5.0 * s,
        _ => icon + mask.as_ref().map_or(0.0, |m| gap + m.width as f32),
    };
    let w = (pad * 2.0 + content).max(h).round();
    let mut pixmap = Pixmap::new(w as u32, h as u32)?;

    // Body: a rectangle with two end circles, filled once (winding rule covers overlaps once).
    let r = h / 2.0;
    let mut pb = PathBuilder::new();
    pb.push_rect(tiny_skia::Rect::from_xywh(r, 0.0, (w - h).max(0.0), h)?);
    pb.push_circle(r, r, r);
    pb.push_circle(w - r, r, r);
    fill(&mut pixmap, pb, BODY);
    stroke(&mut pixmap, pill_outline(w, h, 0.5 * s), EDGE, s);

    let cy = h / 2.0;
    let ix = pad + icon / 2.0;
    match view {
        View::Recording => {
            fill_circle(&mut pixmap, ix, cy, 4.5 * s, RED);
            let x0 = pad + icon + gap;
            for i in 0..BARS {
                let level = levels
                    .len()
                    .checked_sub(BARS - i)
                    .and_then(|k| levels.get(k))
                    .copied()
                    .unwrap_or(0.0)
                    .clamp(0.0, 1.0);
                let bh = (3.0 * s + level.sqrt() * 19.0 * s).min(h - 10.0 * s);
                let x = x0 + i as f32 * 5.0 * s;
                if let Some(rect) = tiny_skia::Rect::from_xywh(x, cy - bh / 2.0, 3.0 * s, bh) {
                    let mut pb = PathBuilder::new();
                    pb.push_rect(rect);
                    fill(&mut pixmap, pb, WHITE);
                }
            }
        }
        View::Transcribing => {
            let start = phase * std::f32::consts::TAU * 1.2;
            let mut pb = PathBuilder::new();
            for k in 0..=20 {
                let a = start + k as f32 / 20.0 * std::f32::consts::TAU * 0.7;
                let (x, y) = (ix + 6.5 * s * a.cos(), cy + 6.5 * s * a.sin());
                if k == 0 {
                    pb.move_to(x, y);
                } else {
                    pb.line_to(x, y);
                }
            }
            stroke(&mut pixmap, pb, WHITE, 2.2 * s);
        }
        View::Done => {
            fill_circle(&mut pixmap, ix, cy, 8.5 * s, GREEN);
            let mut pb = PathBuilder::new();
            pb.move_to(ix - 4.0 * s, cy + 0.2 * s);
            pb.line_to(ix - 1.2 * s, cy + 3.0 * s);
            pb.line_to(ix + 4.2 * s, cy - 3.0 * s);
            stroke(&mut pixmap, pb, (0, 0, 0, 255), 2.0 * s);
        }
        View::Error(_) => {
            fill_circle(&mut pixmap, ix, cy, 8.5 * s, RED);
            let mut pb = PathBuilder::new();
            pb.move_to(ix, cy - 4.5 * s);
            pb.line_to(ix, cy + 1.0 * s);
            pb.move_to(ix, cy + 4.0 * s);
            pb.line_to(ix, cy + 4.1 * s);
            stroke(&mut pixmap, pb, (255, 255, 255, 255), 2.0 * s);
        }
        View::Meeting => fill_circle(&mut pixmap, ix, cy, 5.5 * s, RED),
        View::Hidden => {}
    }
    if let Some(mask) = mask {
        let x = (pad + icon + gap).round() as i32;
        let y = ((h - mask.height as f32) / 2.0).round() as i32;
        blit_mask(&mut pixmap, &mask, x, y, WHITE);
    }
    Some(pixmap)
}

/// The pill outline inset by `inset`, with cubic half-circle ends.
fn pill_outline(w: f32, h: f32, inset: f32) -> PathBuilder {
    const K: f32 = 0.552_284_8;
    let r = h / 2.0 - inset;
    let (l, rt, cy) = (h / 2.0, (w - h / 2.0).max(h / 2.0), h / 2.0);
    let (top, bottom) = (inset, h - inset);
    let mut pb = PathBuilder::new();
    pb.move_to(l, top);
    pb.line_to(rt, top);
    pb.cubic_to(rt + K * r, top, rt + r, cy - K * r, rt + r, cy);
    pb.cubic_to(rt + r, cy + K * r, rt + K * r, bottom, rt, bottom);
    pb.line_to(l, bottom);
    pb.cubic_to(l - K * r, bottom, l - r, cy + K * r, l - r, cy);
    pb.cubic_to(l - r, cy - K * r, l - K * r, top, l, top);
    pb.close();
    pb
}

fn paint(c: (u8, u8, u8, u8)) -> Paint<'static> {
    let mut p = Paint::default();
    p.set_color(Color::from_rgba8(c.0, c.1, c.2, c.3));
    p.anti_alias = true;
    p
}

fn fill(pixmap: &mut Pixmap, pb: PathBuilder, c: (u8, u8, u8, u8)) {
    if let Some(path) = pb.finish() {
        pixmap.fill_path(
            &path,
            &paint(c),
            FillRule::Winding,
            Transform::identity(),
            None,
        );
    }
}

fn fill_circle(pixmap: &mut Pixmap, x: f32, y: f32, r: f32, c: (u8, u8, u8, u8)) {
    let mut pb = PathBuilder::new();
    pb.push_circle(x, y, r);
    fill(pixmap, pb, c);
}

fn stroke(pixmap: &mut Pixmap, pb: PathBuilder, c: (u8, u8, u8, u8), width: f32) {
    if let Some(path) = pb.finish() {
        let stroke = Stroke {
            width,
            line_cap: LineCap::Round,
            ..Stroke::default()
        };
        pixmap.stroke_path(&path, &paint(c), &stroke, Transform::identity(), None);
    }
}

/// Source-over blend of a solid color through a coverage mask.
fn blit_mask(pixmap: &mut Pixmap, mask: &Mask, x0: i32, y0: i32, c: (u8, u8, u8, u8)) {
    let (pw, ph) = (pixmap.width() as i32, pixmap.height() as i32);
    let pixels = pixmap.pixels_mut();
    for my in 0..mask.height as i32 {
        let y = y0 + my;
        if !(0..ph).contains(&y) {
            continue;
        }
        for mx in 0..mask.width as i32 {
            let x = x0 + mx;
            if !(0..pw).contains(&x) {
                continue;
            }
            let cov = mask.alpha[(my as u32 * mask.width + mx as u32) as usize] as u32;
            let a = cov * c.3 as u32 / 255;
            if a == 0 {
                continue;
            }
            let d = &mut pixels[(y * pw + x) as usize];
            let inv = 255 - a;
            let mix = |src: u8, dst: u8| ((src as u32 * a + dst as u32 * inv) / 255) as u8;
            let alpha = (a + d.alpha() as u32 * inv / 255) as u8;
            let (r, g, b) = (mix(c.0, d.red()), mix(c.1, d.green()), mix(c.2, d.blue()));
            if let Some(p) =
                PremultipliedColorU8::from_rgba(r.min(alpha), g.min(alpha), b.min(alpha), alpha)
            {
                *d = p;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct BoxText;
    impl TextMask for BoxText {
        fn mask(&self, text: &str, px: u32) -> Option<Mask> {
            let width = text.len() as u32 * px / 2;
            Some(Mask {
                width,
                height: px,
                alpha: vec![255; (width * px) as usize],
            })
        }
    }

    fn alpha(p: &Pixmap, x: u32, y: u32) -> u8 {
        p.pixel(x, y).unwrap().alpha()
    }

    #[test]
    fn hidden_draws_nothing() {
        assert!(render(&View::Hidden, &[], 0.0, 1.0, &NoText).is_none());
    }

    #[test]
    fn every_view_has_transparent_corners_and_an_opaque_body() {
        let views = [
            View::Recording,
            View::Transcribing,
            View::Done,
            View::Error("No network".into()),
            View::Meeting,
        ];
        for view in &views {
            let p = render(view, &[0.5; 20], 0.3, 1.0, &BoxText).unwrap();
            assert_eq!(p.height(), 36, "{view:?}");
            assert_eq!(alpha(&p, 0, 0), 0, "{view:?} corner");
            assert_eq!(
                alpha(&p, p.width() - 1, p.height() - 1),
                0,
                "{view:?} corner"
            );
            assert!(alpha(&p, p.width() / 2, 2) >= 230, "{view:?} body");
        }
    }

    #[test]
    fn scale_grows_the_pill_and_text_widens_it() {
        let small = render(&View::Recording, &[], 0.0, 1.0, &NoText).unwrap();
        let big = render(&View::Recording, &[], 0.0, 2.0, &NoText).unwrap();
        assert_eq!(big.height(), 72);
        assert!(big.width() > small.width());
        let short = render(&View::Error("x".into()), &[], 0.0, 1.0, &BoxText).unwrap();
        let long = render(&View::Error("x".repeat(40)), &[], 0.0, 1.0, &BoxText).unwrap();
        assert!(long.width() > short.width());
    }

    #[test]
    fn the_edge_is_lighter_than_the_body() {
        let p = render(&View::Done, &[], 0.0, 2.0, &NoText).unwrap();
        let (edge, body) = (
            p.pixel(p.width() / 2, 0).unwrap(),
            p.pixel(p.width() / 2, 10).unwrap(),
        );
        assert!(
            edge.red() > body.red() + 15,
            "edge {} body {}",
            edge.red(),
            body.red()
        );
    }

    #[test]
    fn louder_audio_draws_taller_bars() {
        let lit = |level: f32| {
            let p = render(&View::Recording, &[level; BARS], 0.0, 1.0, &NoText).unwrap();
            // Column through the middle of the last bar.
            let x = (12.0 + 18.0 + 8.0 + (BARS as f32 - 1.0) * 5.0 + 1.5) as u32;
            (0..p.height())
                .filter(|&y| p.pixel(x, y).unwrap().red() > 200)
                .count()
        };
        assert!(lit(1.0) > lit(0.0) + 10);
    }

    #[test]
    fn text_is_blended_white_inside_the_body() {
        let p = render(&View::Done, &[], 0.0, 1.0, &BoxText).unwrap();
        let px = p.pixel(12 + 18 + 8 + 2, 18).unwrap();
        assert!(px.red() > 200 && px.alpha() > 230);
    }
}

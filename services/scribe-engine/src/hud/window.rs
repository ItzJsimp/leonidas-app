//! The pill window on Windows: layered (per-pixel alpha), topmost, never activated, and
//! transparent to the mouse. It runs on its own thread with its own message loop. It reads engine
//! events from a channel and never takes the engine lock. The 30 fps timer and the pixel buffer
//! exist only while the pill is visible.

use super::render::{render, Mask, TextMask, BARS};
use super::{HudModel, View};
use crate::{Event, State};
use std::collections::VecDeque;
use std::ptr::{null, null_mut};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Instant;
use windows_sys::Win32::Foundation::{HWND, POINT, SIZE};
use windows_sys::Win32::Graphics::Gdi::*;
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::HiDpi::{
    GetDpiForMonitor, SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    MDT_EFFECTIVE_DPI,
};
use windows_sys::Win32::UI::WindowsAndMessaging::*;

const WM_HUD_EVENT: u32 = WM_APP + 1;
const WM_HUD_QUIT: u32 = WM_APP + 2;
const FRAME_TIMER: usize = 1;
const FRAME_MS: u32 = 33;
/// Gap between the pill and the bottom of the work area, at 100% scale.
const BOTTOM_GAP: f32 = 48.0;

/// Peak mic level since the last frame, as `f32` bits. The capture callback raises it with
/// `fetch_max` (non-negative `f32` bits order like the numbers); each frame takes it back to 0.
pub type Level = Arc<AtomicU32>;

/// A running pill. Drop closes the window and joins its thread.
pub struct Hud {
    hwnd: usize,
    thread: Option<JoinHandle<()>>,
}

impl Hud {
    /// Wakes the pill so it reads the meeting flag again.
    pub fn notifier(&self) -> impl Fn() + Send + Sync + 'static {
        let hwnd = self.hwnd;
        move || unsafe {
            PostMessageW(hwnd as HWND, WM_HUD_EVENT, 0, 0);
        }
    }

    /// `trigger_at` returns the hotkey time of the current recording, for `hotkey_to_pill_ms`.
    /// `meeting` is true while a meeting records; call `notifier()` after it changes.
    pub fn spawn(
        events: Receiver<Event>,
        level: Level,
        meeting: Arc<std::sync::atomic::AtomicBool>,
        trigger_at: impl Fn() -> Option<Instant> + Send + 'static,
    ) -> Result<Self, String> {
        let queue: Arc<Mutex<VecDeque<Event>>> = Arc::default();
        let (ready_tx, ready_rx) = mpsc::channel();
        let thread = {
            let queue = queue.clone();
            std::thread::Builder::new()
                .name("scribe-hud".into())
                .spawn(move || match create_window() {
                    Ok(hwnd) => {
                        let _ = ready_tx.send(Ok(hwnd as usize));
                        run(hwnd, &queue, &level, &meeting, &trigger_at);
                        unsafe { DestroyWindow(hwnd) };
                    }
                    Err(e) => {
                        let _ = ready_tx.send(Err(e));
                    }
                })
                .map_err(|e| e.to_string())?
        };
        let hwnd = ready_rx.recv().map_err(|e| e.to_string())??;
        std::thread::Builder::new()
            .name("scribe-hud-events".into())
            .spawn(move || {
                for event in events {
                    queue.lock().unwrap().push_back(event);
                    unsafe { PostMessageW(hwnd as HWND, WM_HUD_EVENT, 0, 0) };
                }
            })
            .map_err(|e| e.to_string())?;
        Ok(Self {
            hwnd,
            thread: Some(thread),
        })
    }

    pub fn is_visible(&self) -> bool {
        unsafe { IsWindowVisible(self.hwnd as HWND) != 0 }
    }
}

impl Drop for Hud {
    fn drop(&mut self) {
        unsafe { PostMessageW(self.hwnd as HWND, WM_HUD_QUIT, 0, 0) };
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

fn create_window() -> Result<HWND, String> {
    unsafe {
        // Sharp pixels on scaled monitors; this thread only, so hooks and paste are untouched.
        SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        let instance = GetModuleHandleW(null());
        let class = wide("LeonidasScribePill");
        let wc = WNDCLASSW {
            lpfnWndProc: Some(DefWindowProcW),
            hInstance: instance,
            lpszClassName: class.as_ptr(),
            ..std::mem::zeroed()
        };
        // A second HUD in one process (tests) finds the class already registered.
        RegisterClassW(&wc);
        let hwnd = CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
            class.as_ptr(),
            wide("Leonidas Scribe").as_ptr(),
            WS_POPUP,
            0,
            0,
            1,
            1,
            null_mut(),
            null_mut(),
            instance,
            null(),
        );
        if hwnd.is_null() {
            return Err("could not create the HUD window".into());
        }
        Ok(hwnd)
    }
}

/// Where the pill goes: bottom center of the work area of the monitor under the cursor.
struct Placement {
    center_x: i32,
    bottom: i32,
    scale: f32,
}

fn placement() -> Placement {
    unsafe {
        let mut cursor = POINT { x: 0, y: 0 };
        GetCursorPos(&mut cursor);
        let monitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST);
        let mut info: MONITORINFO = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        GetMonitorInfoW(monitor, &mut info);
        let (mut dx, mut dy) = (96u32, 96u32);
        GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dx, &mut dy);
        let scale = dx as f32 / 96.0;
        let work = info.rcWork;
        Placement {
            center_x: (work.left + work.right) / 2,
            bottom: work.bottom - (BOTTOM_GAP * scale) as i32,
            scale,
        }
    }
}

/// A 32-bit top-down DIB selected into a memory DC.
struct Surface {
    dc: HDC,
    bitmap: HBITMAP,
    old: HGDIOBJ,
    bits: *mut u8,
    width: i32,
    height: i32,
}

impl Surface {
    fn new(width: i32, height: i32) -> Option<Self> {
        unsafe {
            let dc = CreateCompatibleDC(null_mut());
            let mut info: BITMAPINFO = std::mem::zeroed();
            info.bmiHeader = BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                ..std::mem::zeroed()
            };
            let mut bits = null_mut();
            let bitmap = CreateDIBSection(dc, &info, DIB_RGB_COLORS, &mut bits, null_mut(), 0);
            if bitmap.is_null() || bits.is_null() {
                DeleteDC(dc);
                return None;
            }
            let old = SelectObject(dc, bitmap);
            Some(Self {
                dc,
                bitmap,
                old,
                bits: bits.cast(),
                width,
                height,
            })
        }
    }

    fn bytes(&mut self) -> &mut [u8] {
        let len = (self.width * self.height * 4) as usize;
        unsafe { std::slice::from_raw_parts_mut(self.bits, len) }
    }
}

impl Drop for Surface {
    fn drop(&mut self) {
        unsafe {
            SelectObject(self.dc, self.old);
            DeleteObject(self.bitmap);
            DeleteDC(self.dc);
        }
    }
}

/// Keeps the last mask, so a label that stays on screen is drawn by GDI once, not every frame.
#[derive(Default)]
struct CachedText(std::cell::RefCell<Option<(String, u32, Mask)>>);

impl TextMask for CachedText {
    fn mask(&self, text: &str, px: u32) -> Option<Mask> {
        let mut last = self.0.borrow_mut();
        if let Some((t, p, mask)) = last.as_ref() {
            if t == text && *p == px {
                return Some(mask.clone());
            }
        }
        let mask = GdiText.mask(text, px)?;
        *last = Some((text.to_owned(), px, mask.clone()));
        Some(mask)
    }
}

/// Text coverage from GDI: white grayscale-antialiased text on black, read back as alpha.
struct GdiText;

impl TextMask for GdiText {
    fn mask(&self, text: &str, px: u32) -> Option<Mask> {
        let units: Vec<u16> = text.encode_utf16().collect();
        unsafe {
            let face = wide("Segoe UI");
            let font = CreateFontW(
                -(px as i32),
                0,
                0,
                0,
                FW_SEMIBOLD as i32,
                0,
                0,
                0,
                DEFAULT_CHARSET as u32,
                OUT_DEFAULT_PRECIS as u32,
                CLIP_DEFAULT_PRECIS as u32,
                ANTIALIASED_QUALITY as u32,
                DEFAULT_PITCH as u32,
                face.as_ptr(),
            );
            if font.is_null() {
                return None;
            }
            let probe = CreateCompatibleDC(null_mut());
            let old = SelectObject(probe, font);
            let mut size = SIZE { cx: 0, cy: 0 };
            GetTextExtentPoint32W(probe, units.as_ptr(), units.len() as i32, &mut size);
            SelectObject(probe, old);
            DeleteDC(probe);
            let mask = (size.cx > 0 && size.cy > 0)
                .then(|| Surface::new(size.cx, size.cy))
                .flatten()
                .map(|mut surface| {
                    let old = SelectObject(surface.dc, font);
                    SetBkMode(surface.dc, TRANSPARENT as i32);
                    SetTextColor(surface.dc, 0x00FF_FFFF);
                    TextOutW(surface.dc, 0, 0, units.as_ptr(), units.len() as i32);
                    GdiFlush();
                    SelectObject(surface.dc, old);
                    let alpha = surface
                        .bytes()
                        .as_chunks::<4>()
                        .0
                        .iter()
                        .map(|p| p[0].max(p[1]).max(p[2]))
                        .collect();
                    Mask {
                        width: size.cx as u32,
                        height: size.cy as u32,
                        alpha,
                    }
                });
            DeleteObject(font);
            mask
        }
    }
}

struct Frame {
    model: HudModel,
    levels: VecDeque<f32>,
    since: Instant,
    shown: View,
    place: Option<Placement>,
    surface: Option<Surface>,
    timer: bool,
    pill_logged: bool,
    text: CachedText,
}

fn run(
    hwnd: HWND,
    queue: &Mutex<VecDeque<Event>>,
    level: &AtomicU32,
    meeting: &std::sync::atomic::AtomicBool,
    trigger_at: &dyn Fn() -> Option<Instant>,
) {
    let mut f = Frame {
        model: HudModel::default(),
        levels: VecDeque::with_capacity(BARS),
        since: Instant::now(),
        shown: View::Hidden,
        place: None,
        surface: None,
        timer: false,
        pill_logged: false,
        text: CachedText::default(),
    };
    let mut msg: MSG = unsafe { std::mem::zeroed() };
    while unsafe { GetMessageW(&mut msg, null_mut(), 0, 0) } > 0 {
        match msg.message {
            WM_HUD_QUIT => break,
            WM_HUD_EVENT => {
                let now = Instant::now();
                let drained: Vec<Event> = queue.lock().unwrap().drain(..).collect();
                for event in &drained {
                    if matches!(
                        event,
                        Event::State {
                            state: State::Listening,
                            ..
                        }
                    ) {
                        f.pill_logged = false;
                        f.levels.clear();
                        level.store(0, Ordering::Relaxed);
                    }
                    f.model.on_event(event, now);
                }
                f.model.set_meeting(meeting.load(Ordering::Acquire));
                frame(hwnd, &mut f, level, trigger_at);
            }
            WM_TIMER if msg.wParam == FRAME_TIMER => {
                f.model.tick(Instant::now());
                frame(hwnd, &mut f, level, trigger_at);
            }
            _ => unsafe {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            },
        }
    }
    if f.timer {
        unsafe { KillTimer(hwnd, FRAME_TIMER) };
    }
}

fn frame(hwnd: HWND, f: &mut Frame, level: &AtomicU32, trigger_at: &dyn Fn() -> Option<Instant>) {
    let view = f.model.view().clone();
    if view == View::Hidden {
        if f.shown != View::Hidden {
            unsafe {
                ShowWindow(hwnd, SW_HIDE);
                KillTimer(hwnd, FRAME_TIMER);
            }
            f.timer = false;
            f.surface = None;
            f.place = None;
            f.shown = View::Hidden;
        }
        return;
    }
    if view != f.shown {
        f.since = Instant::now();
    }
    if f.place.is_none() {
        f.place = Some(placement());
    }
    let place = f.place.as_ref().unwrap();
    if view == View::Recording {
        let peak = f32::from_bits(level.swap(0, Ordering::Relaxed));
        if f.levels.len() == BARS {
            f.levels.pop_front();
        }
        f.levels.push_back(peak);
    }
    let levels: Vec<f32> = f.levels.iter().copied().collect();
    let phase = f.since.elapsed().as_secs_f32();
    let Some(pixmap) = render(&view, &levels, phase, place.scale, &f.text) else {
        return;
    };
    let (w, h) = (pixmap.width() as i32, pixmap.height() as i32);
    if f.surface
        .as_ref()
        .is_none_or(|s| s.width != w || s.height != h)
    {
        f.surface = Surface::new(w, h);
    }
    let Some(surface) = f.surface.as_mut() else {
        return;
    };
    // tiny-skia is premultiplied RGBA; GDI wants premultiplied BGRA.
    for (dst, src) in surface
        .bytes()
        .as_chunks_mut::<4>()
        .0
        .iter_mut()
        .zip(pixmap.data().as_chunks::<4>().0)
    {
        dst.copy_from_slice(&[src[2], src[1], src[0], src[3]]);
    }
    let pos = POINT {
        x: place.center_x - w / 2,
        y: place.bottom - h,
    };
    let size = SIZE { cx: w, cy: h };
    let origin = POINT { x: 0, y: 0 };
    let blend = BLENDFUNCTION {
        BlendOp: AC_SRC_OVER as u8,
        BlendFlags: 0,
        SourceConstantAlpha: 255,
        AlphaFormat: AC_SRC_ALPHA as u8,
    };
    unsafe {
        UpdateLayeredWindow(
            hwnd,
            null_mut(),
            &pos,
            &size,
            surface.dc,
            &origin,
            0,
            &blend,
            ULW_ALPHA,
        );
        if f.shown == View::Hidden {
            ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
        if !f.timer {
            SetTimer(hwnd, FRAME_TIMER, FRAME_MS, None);
            f.timer = true;
        }
    }
    if view == View::Recording && !f.pill_logged {
        f.pill_logged = true;
        if let Some(t) = trigger_at() {
            eprintln!(
                "hotkey_to_pill_ms={:.1}",
                t.elapsed().as_secs_f64() * 1000.0
            );
        }
    }
    // The meeting pill does not move: no frame timer for an hour-long call.
    if view == View::Meeting && f.timer {
        unsafe { KillTimer(hwnd, FRAME_TIMER) };
        f.timer = false;
    }
    f.shown = view;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn state(state: State) -> Event {
        Event::State {
            state,
            at: String::new(),
        }
    }

    fn wait_for(hud: &Hud, visible: bool) -> bool {
        let end = Instant::now() + Duration::from_secs(2);
        while Instant::now() < end {
            if hud.is_visible() == visible {
                return true;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        false
    }

    /// Writes PNG renders of every view to `SCRIBE_HUD_RENDERS` (default `target/hud-renders`),
    /// on a light and a dark backdrop, at 100% and 200%. Run by hand with `--ignored`.
    #[test]
    #[ignore]
    fn write_renders() {
        use tiny_skia::{Color, Pixmap, PixmapPaint, Transform};
        let dir =
            std::env::var("SCRIBE_HUD_RENDERS").unwrap_or_else(|_| "target/hud-renders".into());
        std::fs::create_dir_all(&dir).unwrap();
        let wave: Vec<f32> = (0..BARS)
            .map(|i| (0.15 + 0.85 * ((i as f32 * 0.9).sin() * 0.5 + 0.5)).powi(2))
            .collect();
        let views = [
            ("1-recording", View::Recording),
            ("2-transcribing", View::Transcribing),
            ("3-done", View::Done),
            (
                "4-error",
                View::Error("Private mode is on, and the offline model is no…".into()),
            ),
        ];
        for scale in [1.0f32, 2.0] {
            for (name, view) in &views {
                let pill = render(view, &wave, 0.15, scale, &GdiText).unwrap();
                for (bg, color) in [("light", (236, 236, 240)), ("dark", (30, 30, 34))] {
                    let pad = (24.0 * scale) as u32;
                    let mut out =
                        Pixmap::new(pill.width() + pad * 2, pill.height() + pad * 2).unwrap();
                    out.fill(Color::from_rgba8(color.0, color.1, color.2, 255));
                    out.draw_pixmap(
                        pad as i32,
                        pad as i32,
                        pill.as_ref(),
                        &PixmapPaint::default(),
                        Transform::identity(),
                        None,
                    );
                    out.save_png(format!("{dir}/{name}-{bg}-{}x.png", scale as u32))
                        .unwrap();
                }
            }
        }
    }

    #[test]
    fn cached_text_reuses_the_last_mask_and_redraws_on_change() {
        let text = CachedText::default();
        let a = text.mask("Done", 13).unwrap();
        assert_eq!(text.0.borrow().as_ref().unwrap().0, "Done");
        assert_eq!(text.mask("Done", 13).unwrap().alpha, a.alpha);
        let b = text.mask("Transcribing", 13).unwrap();
        assert!(b.width > a.width);
        assert_eq!(text.0.borrow().as_ref().unwrap().0, "Transcribing");
    }

    #[test]
    fn gdi_text_mask_has_coverage() {
        let mask = GdiText.mask("Transcribing", 13).unwrap();
        assert!(mask.width > 40 && mask.height >= 13);
        assert!(mask.alpha.iter().any(|&a| a > 200));
    }

    /// Shows a real window on this desktop: run by hand with `--ignored`.
    #[test]
    #[ignore]
    fn window_shows_on_listening_and_hides_on_ready() {
        let (tx, rx) = mpsc::channel();
        let hud = Hud::spawn(rx, Level::default(), Arc::default(), || None).unwrap();
        assert!(!hud.is_visible());
        tx.send(state(State::Listening)).unwrap();
        assert!(wait_for(&hud, true), "pill did not show");
        std::thread::sleep(Duration::from_millis(400));
        tx.send(state(State::Processing)).unwrap();
        std::thread::sleep(Duration::from_millis(400));
        tx.send(state(State::Ready)).unwrap();
        assert!(hud.is_visible(), "done should stay up");
        assert!(wait_for(&hud, false), "pill did not hide after done");
        drop(hud);
    }
}

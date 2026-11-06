//! Focus-taking preset picker, with its own message loop on the caller's worker thread,
//! plus a no-focus status popup that shows while a rewrite runs.
//! Look: Leonidas dark theme, design direction A (`projects/leonidas-scribe/design/rewrite-picker-directions.html`).
use std::{
    cell::{Cell, RefCell},
    ptr::{null, null_mut},
    sync::{
        atomic::{AtomicIsize, Ordering},
        Arc,
    },
};
use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows_sys::Win32::UI::HiDpi::{
    GetDpiForMonitor, SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    MDT_EFFECTIVE_DPI,
};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::SetFocus;
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM},
    Graphics::Gdi::*,
    System::LibraryLoader::GetModuleHandleW,
    UI::WindowsAndMessaging::*,
};

const WIDTH: i32 = 320;
const HEAD: i32 = 32;
const ROW: i32 = 48;
const PAD: i32 = 6;
const FOOTER: i32 = 32;
const RADIUS: i32 = 10;
/// The picker closes by itself, so it can never stay on screen.
const TIMEOUT_MS: u32 = 30_000;

// Leonidas dark tokens, as Win32 BGR values.
const POPOVER: u32 = 0x00251d1d; // #1d1d25
const FG: u32 = 0x00f5f4f4; // #f4f4f5
const MUTED: u32 = 0x00aaa1a1; // #a1a1aa
const BORDER: u32 = 0x00352a2a; // #2a2a35
const SELECTED: u32 = 0x00251e37; // primary at 14% over the popover
const PRIMARY: u32 = 0x002626d9; // #d92626
const KEYCAP: u32 = 0x00372c2c; // #2c2c37
const WHITE: u32 = 0x00ffffff;

thread_local! { static SCALE: Cell<f32> = const { Cell::new(1.0) }; }
/// `v` design pixels in device pixels at this thread's DPI scale.
fn px(v: i32) -> i32 {
    (v as f32 * SCALE.get()).round() as i32
}
/// Makes this thread DPI aware, so Windows does not stretch the window (blurry text), and reads
/// the scale of the monitor under the cursor. Windows made on this thread keep the setting.
unsafe fn init_dpi() {
    SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    let mut cursor: POINT = std::mem::zeroed();
    GetCursorPos(&mut cursor);
    let monitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST);
    let (mut dx, mut dy) = (96u32, 96u32);
    GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dx, &mut dy);
    SCALE.set(dx.max(96) as f32 / 96.0);
}

fn row_at(y: i32, count: usize) -> Option<usize> {
    let top = px(HEAD + PAD);
    (y >= top)
        .then_some(((y - top) / px(ROW)) as usize)
        .filter(|&i| i < count)
}
fn digit_index(key: u32, count: usize) -> Option<usize> {
    (0x31..=0x39)
        .contains(&key)
        .then_some((key.saturating_sub(0x31)) as usize)
        .filter(|&i| i < count)
}
fn picker_height(count: usize) -> i32 {
    px(HEAD + PAD * 2 + ROW * count as i32 + FOOTER)
}

struct Picker {
    items: Vec<(String, String)>,
    chars: usize,
    selected: usize,
    result: Option<usize>,
}
thread_local! { static PICKER: RefCell<Option<Picker>> = const { RefCell::new(None) }; }
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain([0]).collect()
}

/// Segoe UI at `size` design px and `weight`, ClearType.
unsafe fn font(size: i32, weight: i32) -> HFONT {
    let face = wide("Segoe UI");
    CreateFontW(
        -px(size),
        0,
        0,
        0,
        weight,
        0,
        0,
        0,
        0,
        0,
        0,
        5,
        0,
        face.as_ptr(),
    )
}
unsafe fn fill_round(dc: HDC, r: &RECT, color: u32, radius: i32) {
    let brush = CreateSolidBrush(color);
    let old_brush = SelectObject(dc, brush as _);
    let old_pen = SelectObject(dc, GetStockObject(NULL_PEN));
    let radius = px(radius);
    RoundRect(dc, r.left, r.top, r.right + 1, r.bottom + 1, radius, radius);
    SelectObject(dc, old_pen);
    SelectObject(dc, old_brush);
    DeleteObject(brush as _);
}
unsafe fn text(dc: HDC, s: &str, r: &mut RECT, color: u32, flags: u32) {
    SetTextColor(dc, color);
    let w = wide(s);
    DrawTextW(
        dc,
        w.as_ptr(),
        -1,
        r,
        flags | DT_SINGLELINE | DT_END_ELLIPSIS | DT_NOPREFIX,
    );
}
/// Panel background plus a 1 px border on the rounded window edge.
unsafe fn panel(dc: HDC, hwnd: HWND) -> RECT {
    let mut rect: RECT = std::mem::zeroed();
    GetClientRect(hwnd, &mut rect);
    let bg = CreateSolidBrush(POPOVER);
    FillRect(dc, &rect, bg);
    DeleteObject(bg as _);
    let edge = CreateRoundRectRgn(
        0,
        0,
        rect.right + 1,
        rect.bottom + 1,
        px(RADIUS * 2),
        px(RADIUS * 2),
    );
    let border = CreateSolidBrush(BORDER);
    FrameRgn(dc, edge, border, 1, 1);
    DeleteObject(border as _);
    DeleteObject(edge as _);
    SetBkMode(dc, TRANSPARENT as i32);
    rect
}
/// A number key cap, red when the row is selected.
unsafe fn keycap(dc: HDC, x: i32, y: i32, label: &str, selected: bool) {
    let r = RECT {
        left: x,
        top: y,
        right: x + px(20),
        bottom: y + px(20),
    };
    fill_round(dc, &r, if selected { PRIMARY } else { KEYCAP }, 10);
    let mut t = r;
    text(
        dc,
        label,
        &mut t,
        if selected { WHITE } else { MUTED },
        DT_CENTER | DT_VCENTER,
    );
}

unsafe fn paint_picker(dc: HDC, hwnd: HWND, p: &Picker) {
    let rect = panel(dc, hwnd);
    let small = font(12, 400);
    let name_font = font(14, 600);
    let old = SelectObject(dc, small as _);
    let mut head = RECT {
        left: px(14),
        top: 0,
        right: rect.right - px(14),
        bottom: px(HEAD),
    };
    text(dc, "Rewrite selection", &mut head, MUTED, DT_VCENTER);
    text(
        dc,
        &format!("{} characters", p.chars),
        &mut head,
        MUTED,
        DT_VCENTER | DT_RIGHT,
    );
    for (i, (name, summary)) in p.items.iter().enumerate() {
        let top = px(HEAD + PAD) + i as i32 * px(ROW);
        let row = RECT {
            left: px(PAD),
            top,
            right: px(WIDTH - PAD),
            bottom: top + px(ROW) - px(2),
        };
        let selected = i == p.selected;
        if selected {
            fill_round(dc, &row, SELECTED, 14);
            let bar = RECT {
                left: px(PAD),
                top: top + px(8),
                right: px(PAD + 2),
                bottom: top + px(ROW) - px(10),
            };
            let red = CreateSolidBrush(PRIMARY);
            FillRect(dc, &bar, red);
            DeleteObject(red as _);
        }
        SelectObject(dc, small as _);
        keycap(
            dc,
            px(PAD + 10),
            top + px(7),
            &(i + 1).to_string(),
            selected,
        );
        SelectObject(dc, name_font as _);
        let mut n = RECT {
            left: px(PAD + 40),
            top: top + px(5),
            right: row.right - px(10),
            bottom: top + px(25),
        };
        text(dc, name, &mut n, FG, DT_VCENTER);
        SelectObject(dc, small as _);
        let mut d = RECT {
            left: px(PAD + 40),
            top: top + px(24),
            right: row.right - px(10),
            bottom: top + px(42),
        };
        text(dc, summary, &mut d, MUTED, DT_VCENTER);
    }
    let foot_top = rect.bottom - px(FOOTER);
    let line = RECT {
        left: 1,
        top: foot_top,
        right: rect.right - 1,
        bottom: foot_top + 1,
    };
    let border = CreateSolidBrush(BORDER);
    FillRect(dc, &line, border);
    DeleteObject(border as _);
    let mut foot = RECT {
        left: px(14),
        top: foot_top,
        right: rect.right - px(14),
        bottom: rect.bottom,
    };
    text(
        dc,
        "1-9 pick  \u{00b7}  Enter rewrite  \u{00b7}  Esc close",
        &mut foot,
        MUTED,
        DT_VCENTER,
    );
    SelectObject(dc, old);
    DeleteObject(small as _);
    DeleteObject(name_font as _);
}

unsafe extern "system" fn proc(hwnd: HWND, msg: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    match msg {
        WM_KILLFOCUS | WM_TIMER => {
            DestroyWindow(hwnd);
            0
        }
        WM_KEYDOWN => {
            let mut close = false;
            PICKER.with(|p| {
                if let Some(p) = p.borrow_mut().as_mut() {
                    let count = p.items.len();
                    match w as u32 {
                        0x1b => close = true,
                        0x26 => p.selected = (p.selected + count - 1) % count,
                        0x28 => p.selected = (p.selected + 1) % count,
                        0x0d => {
                            p.result = Some(p.selected);
                            close = true;
                        }
                        key => {
                            if let Some(i) = digit_index(key, count) {
                                p.result = Some(i);
                                close = true;
                            }
                        }
                    }
                }
            });
            if close {
                DestroyWindow(hwnd);
            } else {
                InvalidateRect(hwnd, null(), 0);
            }
            0
        }
        WM_MOUSEMOVE => {
            let changed = PICKER.with(|p| {
                let mut p = p.borrow_mut();
                let Some(p) = p.as_mut() else { return false };
                match row_at(((l >> 16) as i16) as i32, p.items.len()) {
                    Some(i) if i != p.selected => {
                        p.selected = i;
                        true
                    }
                    _ => false,
                }
            });
            if changed {
                InvalidateRect(hwnd, null(), 0);
            }
            0
        }
        WM_LBUTTONUP => {
            let hit = PICKER.with(|p| {
                let mut p = p.borrow_mut();
                let p = p.as_mut()?;
                p.result = row_at(((l >> 16) as i16) as i32, p.items.len());
                p.result
            });
            // A click on the header or footer keeps the picker open.
            if hit.is_some() {
                DestroyWindow(hwnd);
            }
            0
        }
        WM_ERASEBKGND => 1,
        WM_PAINT => {
            let mut ps: PAINTSTRUCT = std::mem::zeroed();
            let dc = BeginPaint(hwnd, &mut ps);
            PICKER.with(|p| {
                if let Some(p) = p.borrow().as_ref() {
                    paint_picker(dc, hwnd, p);
                }
            });
            EndPaint(hwnd, &ps);
            0
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, msg, w, l),
    }
}

/// Top-left corner for a window of `width` x `height` at the cursor, kept inside the work area.
unsafe fn place(width: i32, height: i32) -> POINT {
    let mut point: POINT = std::mem::zeroed();
    GetCursorPos(&mut point);
    let mut monitor: MONITORINFO = std::mem::zeroed();
    monitor.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
    if GetMonitorInfoW(
        MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST),
        &mut monitor,
    ) != 0
    {
        let area = monitor.rcWork;
        point.x = point
            .x
            .clamp(area.left, (area.right - width).max(area.left));
        point.y = point
            .y
            .clamp(area.top, (area.bottom - height).max(area.top));
    }
    point
}

/// Shows the picker for `items` (name, one-line summary) and returns the chosen index.
/// `chars` is the length of the selected text, shown in the header.
pub fn pick(items: &[(String, String)], chars: usize) -> Option<usize> {
    if items.is_empty() {
        return None;
    }
    unsafe { init_dpi() };
    PICKER.with(|p| {
        *p.borrow_mut() = Some(Picker {
            items: items.to_vec(),
            chars,
            selected: 0,
            result: None,
        })
    });
    unsafe {
        let instance = GetModuleHandleW(null());
        let class = wide("LeonidasScribePresetPicker");
        let wc = WNDCLASSW {
            lpfnWndProc: Some(proc),
            hInstance: instance,
            lpszClassName: class.as_ptr(),
            hCursor: LoadCursorW(null_mut(), IDC_ARROW),
            ..std::mem::zeroed()
        };
        RegisterClassW(&wc);
        let height = picker_height(items.len());
        let width = px(WIDTH);
        let point = place(width, height);
        let hwnd = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
            class.as_ptr(),
            class.as_ptr(),
            WS_POPUP,
            point.x,
            point.y,
            width,
            height,
            null_mut(),
            null_mut(),
            instance,
            null(),
        );
        if !hwnd.is_null() {
            let region =
                CreateRoundRectRgn(0, 0, width + 1, height + 1, px(RADIUS * 2), px(RADIUS * 2));
            SetWindowRgn(hwnd, region, 1);
            ShowWindow(hwnd, SW_SHOW);
            // A background process may not take the foreground. Sharing the input state of
            // the foreground thread during the call lets SetForegroundWindow work.
            let me = GetCurrentThreadId();
            let front = GetWindowThreadProcessId(GetForegroundWindow(), null_mut());
            let attached = front != 0 && front != me && AttachThreadInput(me, front, 1) != 0;
            SetForegroundWindow(hwnd);
            SetFocus(hwnd);
            if attached {
                AttachThreadInput(me, front, 0);
            }
            if GetForegroundWindow() == hwnd {
                SetTimer(hwnd, 1, TIMEOUT_MS, None);
            } else {
                // Without focus the keys would go to the user's document: close at once.
                DestroyWindow(hwnd);
            }
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    }
    PICKER.with(|p| p.borrow_mut().take().and_then(|p| p.result))
}

// --- Status popup while a rewrite runs. It never takes focus, so typing is not affected. ---

const STATUS_HEIGHT: i32 = 44;
const SPIN_MS: u32 = 80;
const STATUS_TIMEOUT_MS: u32 = 30_000;
thread_local! { static STATUS: RefCell<(String, u32)> = const { RefCell::new((String::new(), 0)) }; }

unsafe extern "system" fn status_proc(hwnd: HWND, msg: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    match msg {
        WM_TIMER if w == 2 => {
            DestroyWindow(hwnd);
            0
        }
        WM_TIMER => {
            STATUS.with(|s| s.borrow_mut().1 += 1);
            InvalidateRect(hwnd, null(), 0);
            0
        }
        WM_MOUSEACTIVATE => MA_NOACTIVATE as LRESULT,
        WM_ERASEBKGND => 1,
        WM_PAINT => {
            let mut ps: PAINTSTRUCT = std::mem::zeroed();
            let dc = BeginPaint(hwnd, &mut ps);
            let rect = panel(dc, hwnd);
            let (name, step) = STATUS.with(|s| s.borrow().clone());
            // 8 dots on a ring; the lit dot moves one place each tick.
            let scale = SCALE.get();
            let (cx, cy) = (24.0 * scale, rect.bottom as f32 / 2.0);
            for i in 0..8u32 {
                let a = i as f32 * std::f32::consts::TAU / 8.0;
                let (x, y) = (
                    (cx + 7.0 * scale * a.cos()) as i32,
                    (cy + 7.0 * scale * a.sin()) as i32,
                );
                let color = if i == step % 8 { PRIMARY } else { KEYCAP };
                let r = px(2);
                let dot = RECT {
                    left: x - r,
                    top: y - r,
                    right: x + r,
                    bottom: y + r,
                };
                fill_round(dc, &dot, color, 4);
            }
            let name_font = font(14, 600);
            let small = font(12, 400);
            let old = SelectObject(dc, name_font as _);
            let mut n = RECT {
                left: px(42),
                top: 0,
                right: rect.right - px(14),
                bottom: rect.bottom,
            };
            text(dc, &name, &mut n, FG, DT_VCENTER);
            SelectObject(dc, small as _);
            text(
                dc,
                "Rewriting\u{2026}  Esc cancels",
                &mut n,
                MUTED,
                DT_VCENTER | DT_RIGHT,
            );
            SelectObject(dc, old);
            DeleteObject(name_font as _);
            DeleteObject(small as _);
            EndPaint(hwnd, &ps);
            0
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, msg, w, l),
    }
}

/// Closes the status popup when dropped.
pub struct Status(Arc<AtomicIsize>);

impl Drop for Status {
    fn drop(&mut self) {
        let hwnd = self.0.swap(0, Ordering::AcqRel) as HWND;
        if !hwnd.is_null() {
            unsafe { PostMessageW(hwnd, WM_CLOSE, 0, 0) };
        }
    }
}

/// Shows "<name>  Rewriting..." at the cursor until the returned handle drops (or 30 s pass).
pub fn status(name: &str) -> Status {
    let slot = Arc::new(AtomicIsize::new(0));
    let thread_slot = slot.clone();
    let name = name.to_owned();
    let _ = std::thread::Builder::new()
        .name("scribe-rewrite-status".into())
        .spawn(move || unsafe {
            init_dpi();
            STATUS.with(|s| *s.borrow_mut() = (name, 0));
            let instance = GetModuleHandleW(null());
            let class = wide("LeonidasScribeRewriteStatus");
            let wc = WNDCLASSW {
                lpfnWndProc: Some(status_proc),
                hInstance: instance,
                lpszClassName: class.as_ptr(),
                hCursor: LoadCursorW(null_mut(), IDC_ARROW),
                ..std::mem::zeroed()
            };
            RegisterClassW(&wc);
            let (width, height) = (px(WIDTH), px(STATUS_HEIGHT));
            let point = place(width, height);
            let hwnd = CreateWindowExW(
                WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                class.as_ptr(),
                class.as_ptr(),
                WS_POPUP,
                point.x,
                point.y,
                width,
                height,
                null_mut(),
                null_mut(),
                instance,
                null(),
            );
            if hwnd.is_null() {
                return;
            }
            let region =
                CreateRoundRectRgn(0, 0, width + 1, height + 1, px(RADIUS * 2), px(RADIUS * 2));
            SetWindowRgn(hwnd, region, 1);
            SetTimer(hwnd, 1, SPIN_MS, None);
            SetTimer(hwnd, 2, STATUS_TIMEOUT_MS, None);
            // The handle may already be dropped: then close at once.
            if thread_slot
                .compare_exchange(0, hwnd as isize, Ordering::AcqRel, Ordering::Acquire)
                .is_err()
                || Arc::strong_count(&thread_slot) == 1
            {
                DestroyWindow(hwnd);
            } else {
                ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            }
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        });
    Status(slot)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mapping() {
        let first = HEAD + PAD;
        assert_eq!(row_at(first, 2), Some(0));
        assert_eq!(row_at(first + ROW, 2), Some(1));
        assert_eq!(row_at(first - 1, 2), None);
        assert_eq!(row_at(first + ROW * 2, 2), None);
        assert_eq!(digit_index(0x32, 2), Some(1));
        assert_eq!(digit_index(0x33, 2), None);
        assert_eq!(picker_height(6), HEAD + PAD * 2 + ROW * 6 + FOOTER);
    }

    /// Shows the real picker at the cursor for 30 s: run by hand with `--ignored` and take a screenshot.
    #[test]
    #[ignore]
    fn shows_the_picker_for_a_screenshot() {
        let items: Vec<(String, String)> = [
            ("Clarity", "One reading per sentence. Same facts."),
            ("Shorter", "Fewer words, same voice."),
            ("Friendly", "Warm note to a client or friend."),
        ]
        .map(|(n, d)| (n.to_owned(), d.to_owned()))
        .to_vec();
        pick(&items, 776);
    }
}
